import type { ZodType } from 'zod';
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
  resolved: ResolvedTransport;
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
  forwardEvent: (event: CortexEvent) => void;
  approvals: ApprovalBridge;
  abort: AbortSignal;
  partials: PartialTracker;
  state: LoopState;
  resumePending?: PendingApproval;
};

const isEmptyObject = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;

const stringify = (value: unknown): string => {
  if (typeof value === 'string') return value;
  try {
    const text = JSON.stringify(value);
    return text === undefined ? String(value) : text;
  } catch {
    return String(value);
  }
};

export const buildToolDescriptor = (tool: ToolDefinition): StepToolDescriptor => ({
  name: tool.config.name,
  description: tool.config.description,
  // Converted by the schema's own zod, not by cortex's: it may come from another copy of zod.
  parameters: tool.config.input['~standard'].jsonSchema.output({ target: 'draft-07' }),
});

export const runLoop = async <TData, TDeps>(
  cfg: LoopConfig<TData, TDeps>,
): Promise<RunResult<TData>> => {
  const s = cfg.state;
  const spec: EnvelopeSpec<TData> = {
    ...(cfg.outputSchema && { schema: cfg.outputSchema }),
    responseMode: cfg.resolved.responseMode,
  };

  const elapsedMs = (): number => s.elapsedBase + (Date.now() - s.startedAt);
  // Not part of the snapshot: a resumed run counts afresh, which can only give a
  // stuck model a few more steps.
  const lastCall = { key: '', repeats: 0 };
  const progress = (): RunProgress => ({
    steps: s.steps,
    usage: s.usage,
    elapsedMs: elapsedMs(),
    outputRetries: s.outputRetries,
    repeatedCalls: lastCall.repeats,
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

  const toolMap = new Map<string, ToolDefinition>();
  for (const tool of cfg.tools) {
    toolMap.set(tool.config.id, tool);
    toolMap.set(tool.config.name, tool);
  }
  const callableNames = cfg.tools.map((tool) => tool.config.name);

  const domainDescriptors = cfg.tools.map(buildToolDescriptor);
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
    const key = JSON.stringify([observation.toolId, observation.args, message]);
    lastCall.repeats = key === lastCall.key ? lastCall.repeats + 1 : 0;
    lastCall.key = key;
  };

  const executeCall = async (
    call: NormalizedCall,
    remaining: NormalizedCall[],
  ): Promise<RunResult<TData> | undefined> => {
    if (cfg.abort.aborted) return fail(makeError('aborted', 'run aborted', errorContext));
    cfg.emit({ type: 'tool-start', call: { id: call.id, toolId: call.toolId, args: call.args } });

    const tool = toolMap.get(call.toolId);
    if (!tool) {
      record(
        call,
        { kind: 'unknown-tool', callId: call.id, toolId: call.toolId, args: call.args },
        `error: unknown tool "${call.toolId}" — the available tools are: ${callableNames.join(', ')}`,
      );
      return undefined;
    }
    const toolId = tool.config.id;

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
        // The resolver is registered before the emit: a listener may approve
        // synchronously during it.
        const askPromise = cfg.approvals.ask(approvalId, cfg.approvalTimeoutMs);
        cfg.emit({
          type: 'approval-required',
          approval: { id: approvalId, toolId, callId: call.id, args, reason: decision.ask.reason },
        });
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
        // The abort check comes before `pending` is cleared: a snapshot taken after
        // an abort still resumes into the approval.
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
      // Some models stringify nested values inside the arguments.
      const repaired = tool.config.input.safeParse(deepDecodeJsonish(args));
      if (repaired.success) parsedArgs = repaired;
    }
    if (!parsedArgs.success) {
      const issues = parsedArgs.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      const hint =
        typeof args === 'string'
          ? ' (your arguments arrived as ONE STRING — call again with a plain JSON object, e.g. {"key": "value"})'
          : isEmptyObject(args)
            ? ` (your arguments arrived EMPTY — nothing was sent. Call ${toolId} again with its arguments filled in, as its parameters describe)`
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

  const streamEmittedOutput = cfg.resolved.transport !== 'respond';
  const oneStep = async (llm: SignalClient, request: StepRequest): Promise<Result<StepResult>> => {
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

  // The pending call goes through its gates again, so a resumed run asks for
  // the approval again, under a new id.
  if (cfg.resumePending) {
    const structural = await processBatch([cfg.resumePending.call, ...cfg.resumePending.remaining]);
    if (structural) return structural;
  }

  let providerRetries = 0;
  let transportRetries = 0;
  while (true) {
    if (cfg.abort.aborted) return fail(makeError('aborted', 'run aborted', errorContext));
    const stopVerdict = checkStop(cfg.stopWhen, progress());
    if (stopVerdict) return failStopped(stopVerdict);

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
    const stepOutcome = await oneStep(llm, request);
    if (!stepOutcome.ok) return fail(stepOutcome.error);
    const result = stepOutcome.data;
    s.usage = addUsage(s.usage, result.usage);

    const outcome: StepOutcome = result.outcome ?? {
      kind: 'failed',
      evidence: 'model call produced no routed outcome',
    };

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

    if (outcome.kind === 'output') {
      const validated = await validateOutput(outcome.value);
      if (validated.ok) return { ok: true, output: validated.envelope, meta: meta() };
      s.messages.push({
        role: 'assistant',
        content: result.content.length > 0 ? result.content : stringify(outcome.value),
      });
      if (wasRejected) {
        providerRetries += 1;
        cfg.emit({
          type: 'retry',
          kind: 'provider',
          attempt: providerRetries,
          issues: `provider rejected the attempt — recovered but invalid: ${validated.issues}`,
        });
      } else {
        const stopped = retryOutput('output', validated.issues, outcome.value);
        if (stopped) return stopped;
      }
      s.messages.push({
        role: 'system',
        content: cfg.resolved.corrections.invalidOutput.replace('{issues}', validated.issues),
      });
      continue;
    }

    // Not counted against outputRetries: that budget is for an output that
    // arrived and failed validation. A run of these ends on another stop condition.
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
