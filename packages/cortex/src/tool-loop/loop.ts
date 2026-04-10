// ═══════════════════════════════════════════════════════════
// Cortex Tool Loop — owns the model→tool→model iteration
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §6. We do NOT delegate to Signal's native tool loop.
// We call signal.step() in a loop because we need:
//   - per-call ledger attribution (which tool burned which tokens)
//   - per-call observation (debugging, replay, future streaming)
//   - per-call gating (an interceptor or policy can deny mid-loop)
//   - context re-pack between iterations (new observations land in
//     the next prompt as part of the regular pipeline)
//
// Phase A scope: ledger attribution + observation. Gating and
// interceptors are added in Phase B/C.
//
// This module is pure with respect to its dependencies — it takes
// a SignalClient (so tests pass a stub) and a tool executor function.

import { z } from 'zod';
import type { Bus, BudgetState, Result } from '../types';
import { ok, err } from '../errors/cortex.errors';
import type { ContextProducer, ResolvedContext } from '../context/types';
import type { SignalClient, CortexLlmToolDefinition, CortexLlmMessage } from '../llm/signal-client';
import type { ToolDefinition } from '../tool/define-tool';
import type { Observation } from '../schemas';
import type { PolicyConfig } from '../schemas/policy.schema';
import { runPipeline } from '../context/pipeline';
import { toLlmMessages } from '../context/messages';
import { counterFor, type TokenEstimationMode } from '../context/tokens';
import type { ReadonlyRegistry } from '../context/types';
import type { Registry } from '../manifold/registry';
import type { Ledger } from '../manifold/ledger';
import { checkBudget, checkTool, type GateDecision } from '../runtime/gate';
import { makeError } from '../errors/cortex.errors';
import { CortexTopics } from '../topics';

export type ToolLoopInput = {
  agentId: string;
  workflowId: string;
  tick: number;
  input: unknown;
  producers: ReadonlyArray<ContextProducer>;
  packBudgetTokens: number;
  tokenMode: TokenEstimationMode;
  maxToolIterations: number;
  // Tool registry view for the model — these are the tools the agent
  // is allowed to call this run. The runtime composes this from the
  // agent's `tools` whitelist + global registry filters.
  availableTools: ReadonlyArray<ToolDefinition>;
  registry: ReadonlyRegistry;
  // Mutable registry passed alongside the readonly view because the
  // gate functions in runtime/gate.ts take Registry. Same instance,
  // different views — the readonly one goes to producers, the
  // mutable one goes to the gate.
  fullRegistry: Registry;
  state: ReadonlyMap<string, unknown>;
  budget: BudgetState;
  llm: SignalClient;
  ledger: Ledger;
  bus: Bus;
  abort?: AbortSignal;
  // Optional policy applied to the gate. If absent, the gate only
  // enforces budget caps from the ledger (registration checks etc.
  // still fire). The agent's policy is threaded through here from
  // executeAgent.
  policy?: PolicyConfig;
  // Observations carried in from prior ticks (plan-mode tick loop).
  // These are the observations the agent should see in its context
  // when this invocation begins. The loop appends its own per-call
  // observations on top.
  seedObservations?: ReadonlyArray<Observation>;
};

export type ToolLoopResult = {
  // The final assistant content from the model — for text/structured
  // mode, this is what gets parsed into the agent's output. For plan
  // mode, the planner parses it into an ActionPlan.
  content: string;
  observations: Observation[];
  iterations: number;
  // The resolved context from the LAST pipeline build (debugging /
  // previewContext parity).
  finalContext: ResolvedContext;
};

const buildToolDescriptor = (tool: ToolDefinition): CortexLlmToolDefinition => {
  // z.toJSONSchema() gives us a draft-07 JSON Schema for the tool's input.
  const parameters = z.toJSONSchema(tool.config.input, { target: 'draft-7' }) as Record<string, unknown>;
  return {
    name: tool.config.id,
    description: tool.config.description,
    parameters,
  };
};

const recordObservation = (
  bus: Bus,
  workflowId: string,
  observation: Observation,
): void => {
  bus.emit({
    topic: CortexTopics.observationRecorded,
    payload: observation,
    meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
  });
  bus.emit({
    topic: CortexTopics.toolObserved,
    payload: observation,
    meta: { timestamp: Date.now(), correlationId: workflowId, workflowId },
  });
};

export const runToolLoop = async (input: ToolLoopInput): Promise<Result<ToolLoopResult>> => {
  const observations: Observation[] = input.seedObservations ? [...input.seedObservations] : [];
  const counter = counterFor(input.tokenMode);
  const toolMap = new Map<string, ToolDefinition>();
  for (const t of input.availableTools) toolMap.set(t.config.id, t);
  const toolDescriptors = input.availableTools.map(buildToolDescriptor);

  let iterations = 0;
  let finalContext: ResolvedContext | undefined;

  // Running conversation for THIS invocation. After every model
  // call that returns tool calls we append:
  //   1. an assistant message carrying the model's tool_calls
  //      exactly as the OpenAI API expects them on the way back
  //   2. one tool message per call with the result, keyed by id
  // The next iteration's signal.step() receives the rebuilt
  // context-pipeline prefix followed by these messages, so the
  // model sees a real conversation in the OpenAI tool-calling
  // format and stops re-calling the same tools.
  const runningMessages: CortexLlmMessage[] = [];

  // Helper: serialize a tool result to a string for the tool message.
  // Most tools return objects; we JSON-stringify. Strings pass through.
  const stringifyToolResult = (value: unknown): string => {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  // Helper: serialize tool-call args for the assistant message we
  // send back. signal.step() returned them as parsed JSON (unknown);
  // OpenAI's API wants them as a JSON string. Re-stringify here.
  const stringifyToolArgs = (value: unknown): string => {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  // Helper: turn a gate denial into a denial Observation. Used both
  // for the per-iteration budget check and the per-tool-call gate.
  const denialObservation = (gate: GateDecision, toolId?: string): Observation => {
    if (gate.allowed) throw new Error('denialObservation called with an allowed gate');
    const detail = gate.detail ? ` (${gate.detail})` : '';
    return {
      stepKind: 'use_tool',
      ...(toolId !== undefined && { toolId }),
      durationMs: 0,
      error: `gate_denied:${gate.reason}${detail}`,
      timestamp: Date.now(),
      workflowId: input.workflowId,
      depth: 0,
      tick: input.tick,
    };
  };

  while (iterations < input.maxToolIterations) {
    if (input.abort?.aborted) {
      throw new Error('aborted');
    }
    iterations += 1;

    // 0. Budget gate before each iteration. If we've blown the
    // workflow budget, stop the loop and surface the denial as the
    // returned content marker. The structured-output parser at the
    // executeAgent layer will turn this into a structured error.
    const budgetGate = checkBudget({
      policy: input.policy,
      registry: input.fullRegistry,
      ledger: input.ledger,
      workflowId: input.workflowId,
    });
    if (!budgetGate.allowed) {
      const obs = denialObservation(budgetGate);
      observations.push(obs);
      recordObservation(input.bus, input.workflowId, obs);
      // Real Result.err — no synthetic content marker. The caller
      // (executeAgent) propagates this directly without trying to
      // parse it as the agent's output.
      return err(
        makeError(
          'budget_exceeded',
          `Tool loop denied by gate before iteration ${iterations}: ${budgetGate.reason}${budgetGate.detail ? ` (${budgetGate.detail})` : ''}`,
          { workflowId: input.workflowId, agentId: input.agentId },
        ),
      );
    }

    // 1. Rebuild context with the latest observations.
    // The pipeline produces the *prefix* of the conversation —
    // system prompt, tools, history, prior-tick observations, input.
    // The runningMessages built up during this invocation get
    // appended after, so the model sees:
    //   [pipeline prefix]
    //   assistant: tool_calls=[...]   ← from runningMessages
    //   tool: result                   ← from runningMessages
    //   assistant: tool_calls=[...]
    //   tool: result
    //   ...
    const resolved = await runPipeline(
      input.producers,
      {
        agentId: input.agentId,
        workflowId: input.workflowId,
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
    const messages: CortexLlmMessage[] = [...prefix, ...runningMessages];

    // 2. Single model call.
    const stepResult = await input.llm.step({
      messages,
      ...(toolDescriptors.length > 0 && { tools: toolDescriptors }),
    });

    // 3. Attribute usage to the ledger.
    if (stepResult.usage.totalTokens > 0) {
      input.ledger.addTokens(input.workflowId, stepResult.usage.totalTokens);
    }

    // 4. If no tool calls, we're done — return the assistant content.
    if (stepResult.toolCalls.length === 0) {
      return ok({
        content: stepResult.content,
        observations,
        iterations,
        finalContext: resolved,
      });
    }

    // 4b. The model wants to call tools. Append the assistant turn
    // to runningMessages so the next iteration sends it back exactly
    // (this is the OpenAI tool-call contract: assistant message with
    // tool_calls, followed by one tool message per call). Without
    // this, models loop because they never see their own previous
    // turn — they just see the original prompt over and over.
    runningMessages.push({
      role: 'assistant',
      content: stepResult.content,
      toolCalls: stepResult.toolCalls.map((c) => ({
        id: c.id,
        name: c.name,
        args: stringifyToolArgs(c.args),
      })),
    });

    // 5. Execute every tool call. Each becomes an Observation AND a
    // tool message in runningMessages, so the next iteration's call
    // sees a complete assistant→tool conversation.
    for (const call of stepResult.toolCalls) {
      // Helper: append a tool result message + optionally an error.
      const appendToolMessage = (resultContent: string): void => {
        runningMessages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: resultContent,
        });
      };

      // Per-tool gate: deny lists, allow lists, risk level, and a
      // fresh budget check (a previous call in this same iteration
      // may have just blown the budget).
      const toolGate = checkTool({
        policy: input.policy,
        registry: input.fullRegistry,
        ledger: input.ledger,
        workflowId: input.workflowId,
        toolId: call.name,
      });
      if (!toolGate.allowed) {
        const obs = denialObservation(toolGate, call.name);
        observations.push(obs);
        recordObservation(input.bus, input.workflowId, obs);
        appendToolMessage(`error: gate_denied:${toolGate.reason}${toolGate.detail ? ` (${toolGate.detail})` : ''}`);
        continue;
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
          workflowId: input.workflowId,
          depth: 0,
          tick: input.tick,
        };
        observations.push(obs);
        recordObservation(input.bus, input.workflowId, obs);
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
          workflowId: input.workflowId,
          depth: 0,
          tick: input.tick,
        };
        observations.push(obs);
        recordObservation(input.bus, input.workflowId, obs);
        appendToolMessage(`error: input_invalid: ${issues}`);
        continue;
      }
      try {
        const ctxAbort = input.abort ?? new AbortController().signal;
        const result = await tool.config.execute(parsed.data, {
          workflowId: input.workflowId,
          agentId: input.agentId,
          signal: ctxAbort,
          bus: input.bus,
        });
        input.ledger.addToolCall(input.workflowId);
        const obs: Observation = {
          stepKind: 'use_tool',
          toolId: call.name,
          durationMs: Date.now() - start,
          result,
          timestamp: Date.now(),
          workflowId: input.workflowId,
          depth: 0,
          tick: input.tick,
        };
        observations.push(obs);
        recordObservation(input.bus, input.workflowId, obs);
        appendToolMessage(stringifyToolResult(result));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const obs: Observation = {
          stepKind: 'use_tool',
          toolId: call.name,
          durationMs: Date.now() - start,
          error: message,
          timestamp: Date.now(),
          workflowId: input.workflowId,
          depth: 0,
          tick: input.tick,
        };
        observations.push(obs);
        recordObservation(input.bus, input.workflowId, obs);
        appendToolMessage(`error: ${message}`);
      }
    }
    // Loop: re-build context. The next iteration's signal.step()
    // call will see the conversation through runningMessages.
  }

  // Hit the iteration cap. Real Result.err — no synthetic content
  // marker. executeAgent surfaces this directly to the caller.
  return err(
    makeError(
      'tool_iterations_exceeded',
      `Tool loop exceeded ${input.maxToolIterations} iterations without producing a final response. The agent kept asking for tool calls.`,
      { workflowId: input.workflowId, agentId: input.agentId },
    ),
  );
};
