// ═══════════════════════════════════════════════════════════
// Cortex Tool Loop — owns the model→tool→model iteration
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §6. We do NOT delegate to Signal's native tool loop.
// We call signal.step() (or signal.stream() when workflow.stream) in
// a loop because we need:
//   - per-call ledger attribution (which tool burned which tokens)
//   - per-call observation (debugging, replay, streaming deltas)
//   - per-call gating (policy + rule effects, read live from WorkflowContext)
//   - context re-pack between iterations (new observations land in
//     the next prompt as part of the regular pipeline)
//
// This module is pure with respect to its dependencies — it takes
// a SignalClient (so tests pass a stub), a list of tool definitions,
// and the live WorkflowContext. It owns tool execution directly.

import { z } from 'zod';
import type { Bus, BudgetState, Result } from '../types';
import { ok, err } from '../errors/cortex.errors';
import type { ContextProducer, ResolvedContext } from '../context/types';
import type { SignalClient } from '../llm/signal-client';
import type {
  Message,
  StepResult,
  StepToolDescriptor,
} from '@niscorp/signal';
import type { ToolDefinition } from '../tool/define-tool';
import type { Observation } from '../schemas';
import type { WorkflowContext } from '../manifold/workflow-context';
import { runPipeline } from '../context/pipeline';
import { toLlmMessages } from '../context/messages';
import { counterFor, type TokenEstimationMode } from '../context/tokens';
import type { ReadonlyRegistry } from '../context/types';
import type { Registry } from '../manifold/registry';
import type { Ledger } from '../manifold/ledger';
import { checkBudget, checkTool, type GateDecision } from '../runtime/gate';
import { makeError, throwCortex } from '../errors/cortex.errors';
import { recordObservation } from '../utils/observation';
import { assertNever } from '../utils/assert-never';
import { withTimeout, DEFAULT_TOOL_TIMEOUT_MS } from '../utils/timeout';
import { CortexTopics, type ConfirmationResponsePayload } from '../topics';

export type ToolLoopInput = {
  agentId: string;
  workflow: WorkflowContext;
  tick: number;
  input: unknown;
  producers: ReadonlyArray<ContextProducer>;
  packBudgetTokens: number;
  tokenMode: TokenEstimationMode;
  maxToolIterations: number;
  availableTools: ReadonlyArray<ToolDefinition>;
  registry: ReadonlyRegistry;
  fullRegistry: Registry;
  state: ReadonlyMap<string, unknown>;
  budget: BudgetState;
  llm: SignalClient;
  ledger: Ledger;
  bus: Bus;
  seedObservations?: ReadonlyArray<Observation>;
};

export type ToolLoopResult = {
  content: string;
  observations: Observation[];
  iterations: number;
  finalContext: ResolvedContext;
};

type ConsumeStreamArgs = {
  input: ToolLoopInput;
  iteration: number;
  request: { messages: Message[]; tools?: StepToolDescriptor[] };
};

const consumeStream = async (
  args: ConsumeStreamArgs,
): Promise<Result<StepResult>> => {
  const { input, iteration, request } = args;
  const workflowId = input.workflow.workflowId;
  const abortSignal = input.workflow.abort.signal;
  let finalResult: StepResult | undefined;
  try {
    for await (const event of input.llm.stream(request, { signal: abortSignal })) {
      if (abortSignal.aborted) break;
      switch (event.type) {
        case 'text':
          input.workflow.emit(CortexTopics.llmDelta, {
            workflowId,
            agentId: input.agentId,
            text: event.text,
            tick: input.tick,
            iteration,
          });
          break;
        case 'done':
          finalResult = event.result;
          break;
        default:
          assertNever(event);
      }
    }
  } catch (e) {
    return err(makeError(
      'model_call_failed',
      e instanceof Error ? e.message : String(e),
      { workflowId, agentId: input.agentId, cause: e },
    ));
  }

  if (finalResult) return ok(finalResult);
  if (abortSignal.aborted) {
    return err(makeError('aborted', 'Stream aborted before completion', { workflowId, agentId: input.agentId }));
  }
  return err(makeError('model_call_failed', 'Stream ended without a done event', { workflowId, agentId: input.agentId }));
};

const buildToolDescriptor = (tool: ToolDefinition): StepToolDescriptor => {
  // z.toJSONSchema returns a plain object that IS a Record<string, unknown>
  // but Zod's return type doesn't express it. This is a Zod library gap.
  const parameters = z.toJSONSchema(tool.config.input, { target: 'draft-7' }) as Record<string, unknown>;
  return {
    name: tool.config.id,
    description: tool.config.description,
    parameters,
  };
};

export const runToolLoop = async (input: ToolLoopInput): Promise<Result<ToolLoopResult>> => {
  const { workflow } = input;
  const workflowId = workflow.workflowId;
  const observations: Observation[] = input.seedObservations ? [...input.seedObservations] : [];
  const counter = counterFor(input.tokenMode);
  const toolMap = new Map<string, ToolDefinition>();
  for (const t of input.availableTools) toolMap.set(t.config.id, t);
  const toolDescriptors = input.availableTools.map(buildToolDescriptor);

  // iteration is 0-indexed and incremented at the end of each loop
  // body. The ToolLoopResult returns `iteration + 1` so callers see
  // a count of iterations run. Error messages add 1 for display.
  let iteration = 0;
  let finalContext: ResolvedContext | undefined;

  const runningMessages: Message[] = [];

  const stringifyToolResult = (value: unknown): string => {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };

  const stringifyToolArgs = (value: unknown): string => {
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };

  const denialObservation = (gate: GateDecision, toolId?: string): Observation => {
    if (gate.allowed) throwCortex(makeError('unknown', 'denialObservation called with an allowed gate'));
    const detail = gate.detail ? ` (${gate.detail})` : '';
    return {
      stepKind: 'use_tool',
      ...(toolId !== undefined && { toolId }),
      durationMs: 0,
      error: `gate_denied:${gate.reason}${detail}`,
      timestamp: Date.now(),
      workflowId,
      depth: 0,
      tick: input.tick,
    };
  };

  // Gate input is built once — it holds references to shared mutable
  // objects (workflow, ledger, registry) so each call reads live state.
  const gateInput = {
    workflow,
    registry: input.fullRegistry,
    ledger: input.ledger,
  };

  while (iteration < input.maxToolIterations) {
    if (workflow.abort.signal.aborted) {
      return err(makeError('aborted', 'Workflow aborted', { workflowId, agentId: input.agentId }));
    }

    // Budget gate before each iteration.
    const budgetGate = checkBudget(gateInput);
    if (!budgetGate.allowed) {
      const obs = denialObservation(budgetGate);
      observations.push(obs);
      recordObservation(workflow, obs);
      return err(
        makeError(
          'budget_exceeded',
          `Tool loop denied by gate before iteration ${iteration + 1}: ${budgetGate.reason}${budgetGate.detail ? ` (${budgetGate.detail})` : ''}`,
          { workflowId, agentId: input.agentId },
        ),
      );
    }

    // Rebuild context with the latest observations.
    const resolved = await runPipeline(
      input.producers,
      {
        agentId: input.agentId,
        workflowId,
        tick: input.tick,
        input: input.input,
        observations,
        registry: input.registry,
        state: input.state,
        budget: input.budget,
      },
      { budgetTokens: input.packBudgetTokens, countTokens: counter },
    );
    finalContext = resolved;
    const prefix = toLlmMessages(resolved);
    const messages: Message[] = [...prefix, ...runningMessages];

    // Single model call — streaming if opted in, else one-shot.
    const request = {
      messages,
      ...(toolDescriptors.length > 0 && { tools: toolDescriptors }),
    };
    let stepResult: StepResult;
    if (workflow.stream) {
      const streamResult = await consumeStream({ input, iteration, request });
      if (!streamResult.ok) return err(streamResult.error);
      stepResult = streamResult.data;
    } else {
      stepResult = await input.llm.step(request);
    }

    // Check abort after step — a rule may have fired during the await.
    if (workflow.abort.signal.aborted) {
      return err(makeError('aborted', 'Workflow aborted by rule', { workflowId, agentId: input.agentId }));
    }

    // Attribute usage to the ledger.
    if (stepResult.usage.totalTokens > 0) {
      input.ledger.addTokens(workflowId, stepResult.usage.totalTokens);
    }

    // No tool calls → done.
    if (stepResult.toolCalls.length === 0) {
      return ok({
        content: stepResult.content,
        observations,
        iterations: iteration + 1,
        finalContext: resolved,
      });
    }

    // Append assistant turn to running messages.
    runningMessages.push({
      role: 'assistant',
      content: stepResult.content,
      toolCalls: stepResult.toolCalls.map((c) => ({
        id: c.id,
        name: c.name,
        args: stringifyToolArgs(c.args),
      })),
    });

    // Execute every tool call.
    for (const call of stepResult.toolCalls) {
      const appendToolMessage = (resultContent: string): void => {
        runningMessages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: resultContent,
        });
      };

      // Per-tool gate — reads live policy from workflow context.
      const toolGate = checkTool({ ...gateInput, toolId: call.name });
      if (!toolGate.allowed) {
        // Confirmation flow: emit request, wait for approval.
        if (toolGate.reason === 'confirmation_required') {
          const confirmationTimeout = workflow.policy.confirmationTimeoutMs ?? 60_000;
          // Subscribe BEFORE emitting — handler may respond synchronously.
          const confirmationPromise = input.bus.waitFor(CortexTopics.confirmationPattern, {
            timeoutMs: confirmationTimeout,
            filter: (e) => {
              if (e.payload === null || typeof e.payload !== 'object') return false;
              const p = e.payload as ConfirmationResponsePayload;
              return p.toolId === call.name &&
                (e.topic === CortexTopics.confirmationApproved || e.topic === CortexTopics.confirmationDenied);
            },
            signal: workflow.abort.signal,
          });
          workflow.emit(CortexTopics.confirmationRequested, {
            workflowId,
            toolId: call.name,
            input: call.args,
          });
          try {
            const response = await confirmationPromise;
            if (response.topic === CortexTopics.confirmationApproved) {
              // Approved — fall through to execute the tool.
            } else {
              const obs = denialObservation(toolGate, call.name);
              observations.push(obs);
              recordObservation(workflow, obs);
              appendToolMessage(`error: confirmation_denied: ${call.name}`);
              continue;
            }
          } catch {
            const obs = denialObservation(toolGate, call.name);
            observations.push(obs);
            recordObservation(workflow, obs);
            appendToolMessage(`error: confirmation_timeout: ${call.name}`);
            continue;
          }
        } else {
          const obs = denialObservation(toolGate, call.name);
          observations.push(obs);
          recordObservation(workflow, obs);
          appendToolMessage(`error: gate_denied:${toolGate.reason}${toolGate.detail ? ` (${toolGate.detail})` : ''}`);
          continue;
        }
      }

      const tool = toolMap.get(call.name);
      const start = Date.now();
      if (!tool) {
        const obs: Observation = {
          stepKind: 'use_tool',
          toolId: call.name,
          durationMs: Date.now() - start,
          error: `tool_not_registered: ${call.name}`,
          timestamp: Date.now(),
          workflowId,
          depth: 0,
          tick: input.tick,
        };
        observations.push(obs);
        recordObservation(workflow, obs);
        appendToolMessage(`error: tool_not_registered: ${call.name}`);
        continue;
      }

      // Validate input against the tool's Zod schema.
      const parsed = tool.config.input.safeParse(call.args);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => i.message).join('; ');
        const obs: Observation = {
          stepKind: 'use_tool',
          toolId: call.name,
          durationMs: Date.now() - start,
          error: `input_invalid: ${issues}`,
          timestamp: Date.now(),
          workflowId,
          depth: 0,
          tick: input.tick,
        };
        observations.push(obs);
        recordObservation(workflow, obs);
        appendToolMessage(`error: input_invalid: ${issues}`);
        continue;
      }

      try {
        const timeout = tool.config.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
        const result = await withTimeout(
          tool.config.execute(parsed.data, {
            workflowId,
            agentId: input.agentId,
            signal: workflow.abort.signal,
            bus: input.bus,
          }),
          timeout,
          `tool ${call.name}`,
        );
        input.ledger.addToolCall(workflowId);
        const obs: Observation = {
          stepKind: 'use_tool',
          toolId: call.name,
          durationMs: Date.now() - start,
          result,
          timestamp: Date.now(),
          workflowId,
          depth: 0,
          tick: input.tick,
        };
        observations.push(obs);
        recordObservation(workflow, obs);
        appendToolMessage(stringifyToolResult(result));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const obs: Observation = {
          stepKind: 'use_tool',
          toolId: call.name,
          durationMs: Date.now() - start,
          error: message,
          timestamp: Date.now(),
          workflowId,
          depth: 0,
          tick: input.tick,
        };
        observations.push(obs);
        recordObservation(workflow, obs);
        appendToolMessage(`error: ${message}`);
      }
    }

    iteration += 1;
  }

  return err(
    makeError(
      'tool_iterations_exceeded',
      `Tool loop exceeded ${input.maxToolIterations} iterations without producing a final response.`,
      { workflowId, agentId: input.agentId },
    ),
  );
};
