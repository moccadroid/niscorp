// ═══════════════════════════════════════════════════════════
// The loop — model → tools → model, bounded, gated, observed
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §4. Rules this file lives by:
//   - Append-only transcript. The prefix is built once (run.ts);
//     corrections, injections and nudges are APPENDED messages.
//   - Tool calls execute sequentially, in model order.
//   - Tool failures are observations the model sees, never run
//     failures. The run fails only on structural conditions.
//   - Streaming is not a mode: the loop always consumes
//     signal.stepStream; `await run.result` is the opt-out.

import { z, type ZodType } from 'zod';
import type { Message, StepRequest, StepResult, StepToolDescriptor, ResolvedTransport, StepOutcome } from '@niscorp/signal';
import { deepDecodeJsonish } from '@niscorp/signal';
import {
  addUsage,
  type CortexError,
  type Envelope,
  type Result,
  type RunMeta,
  type RunResult,
  type SignalClient,
  type StopReason,
  type ToolObservation,
  type Usage,
} from '../types';
import { makeError, ok, err } from '../errors/cortex.errors';
import type { CortexEvent, CortexEventBody } from '../events/types';
import { validateEnvelope, type EnvelopeSpec } from '../schemas/envelope.schema';
import type { PartialTracker } from './partials';
import type {
  PrepareStep,
  RunCtx,
  RunProgress,
  StopCondition,
  ToolGate,
  ToolResultHook,
} from '../gates/types';
import { checkStop } from '../gates/stop';
import type { ApprovalBridge } from '../gates/approval';
import type { ToolContext, ToolDefinition } from '../tool/define-tool';
import { withTimeout, DEFAULT_TOOL_TIMEOUT_MS } from '../utils/timeout';
import { newApprovalId } from '../utils/id';
import { trustJsonSchemaRecord } from '../utils/trust';

// ───────────────────────────────────────────────────────────
// Shared mutable run state — read by snapshot(), written here
// ───────────────────────────────────────────────────────────

export type NormalizedCall = { id: string; toolId: string; args: unknown };

export type PendingApproval = {
  approvalId: string;
  call: NormalizedCall;
  remaining: NormalizedCall[];
  reason: string;
};

export type LoopState = {
  messages: Message[];
  steps: number;
  usage: Usage;
  outputRetries: number;
  startedAt: number;
  // Elapsed ms carried over from a snapshot; 0 for fresh runs.
  elapsedBase: number;
  pending?: PendingApproval;
};

export type OutputValidator<TData> = (
  output: Envelope<TData>,
) => { ok: true } | { retry: string } | Promise<{ ok: true } | { retry: string }>;

export type LoopConfig<TData, TDeps> = {
  runId: string;
  agentId: string;
  agentPath: ReadonlyArray<string>;
  llm: SignalClient;
  transport: 'stream' | 'step';
  tools: ReadonlyArray<ToolDefinition>;
  // The transport signal resolved for this provider (run.ts).
  resolved: ResolvedTransport;
  // The acceptance schema signal's router gates arrivals on.
  accept: ZodType;
  outputSchema?: ZodType<TData>;
  outputValidate?: OutputValidator<TData>;
  gates: ReadonlyArray<ToolGate<TDeps>>;
  resultHooks: ReadonlyArray<ToolResultHook<TDeps>>;
  prepareStep?: PrepareStep<TDeps>;
  stopWhen: ReadonlyArray<StopCondition>;
  approvalTimeoutMs?: number;
  deps: TDeps;
  emit: (body: CortexEventBody) => void;
  // Re-push a child run's events (asTool delegation) — see channel.forward.
  forwardEvent: (event: CortexEvent) => void;
  approvals: ApprovalBridge;
  abort: AbortSignal;
  partials: PartialTracker;
  state: LoopState;
  // Set when resuming a snapshot that was suspended on an approval:
  // the pending call (and the rest of its batch) run before the loop.
  resumePending?: PendingApproval;
};

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────

const stringify = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch {
    return String(value);
  }
};

// Exported for preview: the preview must show EXACTLY the descriptors
// the run sends, from the same builder.
export const buildToolDescriptor = (tool: ToolDefinition): StepToolDescriptor => ({
  // The model sees the tool's NAME — the field designed for it (prompts
  // say "call `query`"). The id stays the gate/policy/observation
  // identity; the loop resolves calls by either.
  name: tool.config.name,
  description: tool.config.description,
  parameters: trustJsonSchemaRecord(z.toJSONSchema(tool.config.input, { target: 'draft-7' })),
});

// JSON forensics live in SIGNAL's wire layer now — the loop consumes
// routed outcomes and never parses strings out of model turns.

// ───────────────────────────────────────────────────────────
// runLoop
// ───────────────────────────────────────────────────────────

export const runLoop = async <TData, TDeps>(
  cfg: LoopConfig<TData, TDeps>,
): Promise<RunResult<TData>> => {
  const s = cfg.state;
  const spec: EnvelopeSpec<TData> = {
    ...(cfg.outputSchema && { schema: cfg.outputSchema }),
    responseMode: cfg.resolved.responseMode,
  };

  const elapsedMs = (): number => s.elapsedBase + (Date.now() - s.startedAt);
  const progress = (): RunProgress => ({
    steps: s.steps,
    usage: s.usage,
    elapsedMs: elapsedMs(),
    outputRetries: s.outputRetries,
  });
  const meta = (): RunMeta => ({
    usage: s.usage,
    strategy: cfg.resolved.transport,
    steps: s.steps,
    outputRetries: s.outputRetries,
    elapsedMs: elapsedMs(),
  });
  const errorContext = { runId: cfg.runId, agentPath: cfg.agentPath };
  const fail = (error: CortexError): RunResult<TData> => ({ ok: false, error, meta: meta() });
  const failStopped = (verdict: { stop: StopReason; message: string }): RunResult<TData> =>
    fail(makeError('stopped', verdict.message, { ...errorContext, stop: verdict.stop }));

  // Resolvable by NAME (what the model calls) and by ID (what prompts
  // may echo and what policies key on).
  const toolMap = new Map<string, ToolDefinition>();
  for (const tool of cfg.tools) {
    toolMap.set(tool.config.id, tool);
    toolMap.set(tool.config.name, tool);
  }
  const callableNames = cfg.tools.map((tool) => tool.config.name);

  const domainDescriptors = cfg.tools.map(buildToolDescriptor);
  // The exit tool (respond transport) is SIGNAL's — appended to the
  // wire request, routed back as output, never visible as a tool here.
  const exitDescriptor: StepToolDescriptor | undefined = cfg.resolved.respondDescriptor;

  const runCtx = (): RunCtx<TDeps> => ({
    runId: cfg.runId,
    agentId: cfg.agentId,
    agentPath: cfg.agentPath,
    deps: cfg.deps,
    step: s.steps,
    usage: s.usage,
    signal: cfg.abort,
  });

  const toolContext = (): ToolContext => ({
    runId: cfg.runId,
    agentId: cfg.agentId,
    agentPath: cfg.agentPath,
    signal: cfg.abort,
    forward: cfg.forwardEvent,
  });

  const appendToolMessage = (call: NormalizedCall, content: string): void => {
    s.messages.push({ role: 'tool', toolCallId: call.id, name: call.toolId, content });
  };

  const record = (call: NormalizedCall, observation: ToolObservation, message: string): void => {
    cfg.emit({ type: 'tool-end', observation });
    appendToolMessage(call, message);
  };

  // ─── one gated, observed tool call ────────────────────────
  // Returns a RunResult only on structural failure (abort).
  const executeCall = async (
    call: NormalizedCall,
    remaining: NormalizedCall[],
  ): Promise<RunResult<TData> | undefined> => {
    if (cfg.abort.aborted) return fail(makeError('aborted', 'run aborted', errorContext));
    cfg.emit({ type: 'tool-start', call: { id: call.id, toolId: call.toolId, args: call.args } });

    const tool = toolMap.get(call.toolId);
    if (!tool) {
      // Name the alternatives — an unnamed rejection teaches nothing and
      // the model just retries the same wrong name.
      record(
        call,
        { kind: 'unknown-tool', callId: call.id, toolId: call.toolId, args: call.args },
        `error: unknown tool "${call.toolId}" — the available tools are: ${callableNames.join(', ')}`,
      );
      return undefined;
    }
    // Canonical identity for gates, policy and observations — regardless
    // of whether the model called the name or the id.
    const toolId = tool.config.id;

    // Gate chain — first deny/timeout wins; allow may rewrite args;
    // an approved ask keeps running the remaining gates.
    let args = call.args;
    let denial: string | undefined;
    for (const gate of cfg.gates) {
      const decision = await gate(
        {
          id: call.id,
          toolId,
          args,
          ...(tool.config.riskLevel !== undefined && { riskLevel: tool.config.riskLevel }),
        },
        runCtx(),
      );
      if ('deny' in decision) {
        denial = decision.deny;
        break;
      }
      if ('ask' in decision) {
        const approvalId = newApprovalId();
        s.pending = { approvalId, call: { ...call, args }, remaining, reason: decision.ask.reason };
        // Register the resolver BEFORE emitting — an event listener may
        // approve synchronously during the emit.
        const askPromise = cfg.approvals.ask(approvalId, cfg.approvalTimeoutMs);
        cfg.emit({
          type: 'approval-required',
          approval: { id: approvalId, toolId, callId: call.id, args, reason: decision.ask.reason },
        });
        // Abort-aware wait: an aborted run must not hang on a pending
        // approval — it settles as a denial and the abort check below
        // turns it into the structural aborted result. The snapshot
        // kept `pending`, so a resume re-asks.
        const outcome = await new Promise<Awaited<ReturnType<ApprovalBridge['ask']>>>((resolve) => {
          const onAbort = (): void => resolve({ approved: false, reason: 'aborted' });
          if (cfg.abort.aborted) {
            onAbort();
            return;
          }
          cfg.abort.addEventListener('abort', onAbort, { once: true });
          void askPromise.then((askDecision) => {
            cfg.abort.removeEventListener('abort', onAbort);
            resolve(askDecision);
          });
        });
        // Keep `pending` on abort so a snapshot taken afterwards still
        // resumes into the approval.
        if (cfg.abort.aborted) return fail(makeError('aborted', 'run aborted', errorContext));
        s.pending = undefined;
        if (!outcome.approved) {
          denial = outcome.reason;
          break;
        }
        if (outcome.args !== undefined) args = outcome.args;
        continue;
      }
      if (decision.args !== undefined) args = decision.args;
    }

    if (denial !== undefined) {
      record(
        call,
        { kind: 'denied', callId: call.id, toolId, args, reason: denial },
        `error: denied: ${denial}`,
      );
      return undefined;
    }

    let parsedArgs = tool.config.input.safeParse(args);
    if (!parsedArgs.success) {
      // Deep rescue, gated by THIS tool's schema (the owner of the
      // contract): some models stringify nested values inside args.
      // Accepted only when the repaired args validate; otherwise the
      // ORIGINAL error surfaces.
      const repaired = tool.config.input.safeParse(deepDecodeJsonish(args));
      if (repaired.success) parsedArgs = repaired;
    }
    if (!parsedArgs.success) {
      const issues = parsedArgs.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      // A correction the model can act on: string-at-root is almost
      // always mis-encoded arguments, not a wrong value.
      const hint =
        typeof args === 'string'
          ? ' (your arguments arrived as ONE STRING — call again with a plain JSON object, e.g. {"key": "value"})'
          : '';
      record(
        call,
        {
          kind: 'error',
          callId: call.id,
          toolId,
          args,
          error: `input_invalid: ${issues}${hint}`,
          durationMs: 0,
        },
        `error: input_invalid: ${issues}${hint}`,
      );
      return undefined;
    }

    const started = Date.now();
    try {
      const timeoutMs = tool.config.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
      const value = await withTimeout(
        Promise.resolve(tool.config.execute(parsedArgs.data, toolContext())),
        timeoutMs,
        `tool ${toolId}`,
      );
      let observation: ToolObservation = {
        kind: 'result',
        callId: call.id,
        toolId,
        args: parsedArgs.data,
        result: value,
        durationMs: Date.now() - started,
      };
      for (const hook of cfg.resultHooks) {
        const outcome = await hook(observation, runCtx());
        if (outcome && outcome.result !== undefined) {
          observation = { ...observation, result: outcome.result };
        }
      }
      const finalResult = observation.kind === 'result' ? observation.result : undefined;
      record(call, observation, stringify(finalResult));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      record(
        call,
        {
          kind: 'error',
          callId: call.id,
          toolId,
          args: parsedArgs.data,
          error: message,
          durationMs: Date.now() - started,
        },
        `error: ${message}`,
      );
    }
    return undefined;
  };

  const processBatch = async (calls: NormalizedCall[]): Promise<RunResult<TData> | undefined> => {
    for (let index = 0; index < calls.length; index += 1) {
      const call = calls[index];
      if (call === undefined) continue;
      const structural = await executeCall(call, calls.slice(index + 1));
      if (structural) return structural;
    }
    return undefined;
  };

  // ─── envelope validation (respond args or parsed text) ────
  const validateOutput = async (
    raw: unknown,
  ): Promise<{ ok: true; envelope: Envelope<TData> } | { ok: false; issues: string }> => {
    const verdict = validateEnvelope<TData>(raw, spec);
    if (!verdict.ok) return verdict;
    if (cfg.outputValidate) {
      const validated = await cfg.outputValidate(verdict.envelope);
      if (!('ok' in validated)) return { ok: false, issues: validated.retry };
    }
    return verdict;
  };

  // ─── one streamed model call ──────────────────────────────
  const streamEmittedOutput = cfg.resolved.transport !== 'respond';
  const streamOneStep = async (llm: SignalClient, request: StepRequest): Promise<Result<StepResult>> => {
    // Non-streaming transport: one call, no deltas (no output-partial).
    if (cfg.transport === 'step') {
      try {
        return ok(await llm.step(request));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        return err(makeError('model_call_failed', message, { ...errorContext, cause }));
      }
    }
    let final: StepResult | undefined;
    const respondIndices = new Set<number>();
    try {
      for await (const event of llm.stepStream(request, { signal: cfg.abort })) {
        if (cfg.abort.aborted) break;
        if (event.type === 'text') {
          cfg.emit({ type: 'model-delta', text: event.text, channel: 'text' });
          if (streamEmittedOutput) {
            cfg.emit({ type: 'output-delta', text: event.text });
            cfg.partials.write(event.text);
          }
          continue;
        }
        // The reasoning channel — shown in flight, never part of the output. It
        // is not fed to `partials`: a caller reading the answer must not see the
        // thinking bleed into it.
        if (event.type === 'reasoning') {
          cfg.emit({ type: 'model-delta', text: event.text, channel: 'reasoning' });
          continue;
        }
        if (event.type === 'tool_call_delta') {
          if (event.name !== undefined && event.name === cfg.resolved.outputToolName) respondIndices.add(event.index);
          if (respondIndices.has(event.index) && event.argsText.length > 0) {
            cfg.emit({ type: 'output-delta', text: event.argsText });
            cfg.partials.write(event.argsText);
          }
          continue;
        }
        final = event.result;
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return err(makeError('model_call_failed', message, { ...errorContext, cause }));
    }
    if (final) return ok(final);
    if (cfg.abort.aborted) return err(makeError('aborted', 'run aborted during model call', errorContext));
    return err(makeError('model_call_failed', 'stream ended without a done event', errorContext));
  };

  // lastAttempt: the raw routed value of the most recent semantically-
  // invalid output. Rides the stopped error so callers can CONTINUE
  // from a failed run's best candidate instead of rebuilding.
  let lastAttempt: unknown;
  const retryOutput = (kind: 'output' | 'termination', issues: string, attempt?: unknown): RunResult<TData> | undefined => {
    if (attempt !== undefined) lastAttempt = attempt;
    s.outputRetries += 1;
    cfg.emit({ type: 'retry', kind, attempt: s.outputRetries, issues });
    cfg.partials.reset();
    const verdict = checkStop(cfg.stopWhen, progress());
    if (verdict) {
      return fail(
        makeError('stopped', verdict.message, {
          ...errorContext,
          stop: verdict.stop,
          ...(lastAttempt !== undefined && { lastOutput: lastAttempt }),
        }),
      );
    }
    return undefined;
  };

  // ─── resume: finish the batch that was suspended ──────────
  // Gates re-run for the pending call, so the policy re-asks and a
  // fresh approval-required event fires — resume re-asks by design.
  if (cfg.resumePending) {
    const structural = await processBatch([cfg.resumePending.call, ...cfg.resumePending.remaining]);
    if (structural) return structural;
  }

  // ─── the loop ─────────────────────────────────────────────
  let providerRetries = 0;
  let transportRetries = 0;
  while (true) {
    if (cfg.abort.aborted) return fail(makeError('aborted', 'run aborted', errorContext));
    const stopVerdict = checkStop(cfg.stopWhen, progress());
    if (stopVerdict) return failStopped(stopVerdict);

    // prepareStep — the dynamic-steering hook (domain tools only; the
    // transport's exit tool is not cortex's to mask).
    let domain = domainDescriptors;
    let llm = cfg.llm;
    let toolChoice: StepRequest['toolChoice'] | undefined = cfg.resolved.toolChoice;
    if (cfg.prepareStep) {
      const prepared = await cfg.prepareStep({
        step: s.steps + 1,
        messages: s.messages,
        usage: s.usage,
        tools: domain.map((descriptor) => descriptor.name),
        deps: cfg.deps,
      });
      if (prepared) {
        if (prepared.activeTools) {
          const active = new Set(prepared.activeTools);
          domain = domain.filter((descriptor) => active.has(descriptor.name));
        }
        if (prepared.toolChoice !== undefined) toolChoice = prepared.toolChoice;
        if (prepared.inject) s.messages.push(...prepared.inject);
        if (prepared.llm) llm = prepared.llm;
      }
    }
    const descriptors: StepToolDescriptor[] = [...domain, ...(exitDescriptor ? [exitDescriptor] : [])];

    s.steps += 1;
    cfg.emit({ type: 'step-start', step: s.steps });

    // The request shape is IMMUTABLE for the life of the run: same
    // tools, same choice, same format every step. Adaptation happens
    // on the response side (signal's wire layer), never here.
    const request: StepRequest = {
      messages: [...s.messages],
      ...(descriptors.length > 0 && { tools: descriptors }),
      ...(toolChoice !== undefined && { toolChoice }),
      ...(cfg.resolved.responseFormat !== undefined && { responseFormat: cfg.resolved.responseFormat }),
      output: {
        accept: cfg.accept,
        ...(cfg.resolved.outputToolName !== undefined && { outputTool: cfg.resolved.outputToolName }),
      },
    };
    const stepOutcome = await streamOneStep(llm, request);
    if (!stepOutcome.ok) return fail(stepOutcome.error);
    const result = stepOutcome.data;
    s.usage = addUsage(s.usage, result.usage);

    // ── the routed view ──
    // Signal normalized and routed the turn (wire repairs, provider
    // rejection recovery — all validation-gated, all provider-blind
    // from here). The loop only decides what each outcome MEANS.
    const outcome: StepOutcome = result.outcome ?? {
      kind: 'failed',
      evidence: 'model call produced no routed outcome',
    };

    // A provider rejection whose attempt ROUTED (tool call or output)
    // is not a retry — the run moves on as if the 400 never happened,
    // and the trace shows the outcome itself. Only a rejection with
    // nothing salvageable emits the provider-retry event (a correction
    // follows). Never counted against outputRetries either way.
    const wasRejected = result.finishReason === 'error_recovered';
    if (wasRejected) {
      cfg.partials.reset();
      if (outcome.kind === 'failed') {
        providerRetries += 1;
        cfg.emit({
          type: 'retry',
          kind: 'provider',
          attempt: providerRetries,
          issues: `provider rejected the attempt — ${outcome.evidence}`,
        });
      }
    }

    // ── tool calls ──
    if (outcome.kind === 'tool_calls') {
      s.messages.push({
        role: 'assistant',
        content: result.content,
        toolCalls: outcome.calls.map((call) => ({ id: call.id, name: call.name, args: stringify(call.args) })),
      });
      const calls: NormalizedCall[] = outcome.calls.map((call) => ({
        id: call.id,
        toolId: call.name,
        args: call.args,
      }));
      const structural = await processBatch(calls);
      if (structural) return structural;
      continue;
    }

    // ── output ──
    // A JSON container arrived (the gate is only that); the SEMANTICS
    // are judged HERE: envelope validation + the agent's own validate
    // (harness). Corrections quote this evidence — the one judge.
    if (outcome.kind === 'output') {
      const validated = await validateOutput(outcome.value);
      if (validated.ok) return { ok: true, output: validated.envelope, meta: meta() };
      s.messages.push({
        role: 'assistant',
        content: result.content.length > 0 ? result.content : stringify(outcome.value),
      });
      if (wasRejected) {
        // A provider-rejected attempt is never the run's fault — the
        // correction teaches, the budget stays intact.
        providerRetries += 1;
        cfg.emit({
          type: 'retry',
          kind: 'provider',
          attempt: providerRetries,
          issues: `provider rejected the attempt — recovered but invalid: ${validated.issues}`,
        });
      } else {
        // Semantic failure — the model must REVISE. Counted.
        const stopped = retryOutput('output', validated.issues, outcome.value);
        if (stopped) return stopped;
      }
      s.messages.push({
        role: 'system',
        content: cfg.resolved.corrections.invalidOutput.replace('{issues}', validated.issues),
      });
      continue;
    }

    // ── failed ──
    // Transport failure: nothing deliverable arrived (prose turn,
    // garbage, truncated rejection). Uncounted — the revision budget is
    // for semantic failures; stepCount and duration still bound the run.
    if (result.content.length > 0) {
      s.messages.push({ role: 'assistant', content: result.content });
    }
    if (!wasRejected) {
      transportRetries += 1;
      cfg.emit({ type: 'retry', kind: 'termination', attempt: transportRetries, issues: outcome.evidence });
      cfg.partials.reset();
    }
    s.messages.push({
      role: 'system',
      content: cfg.resolved.corrections.invalidOutput.replace('{issues}', outcome.evidence),
    });

  }
};
