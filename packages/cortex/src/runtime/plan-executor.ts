// ═══════════════════════════════════════════════════════════
// Plan executor — depth-first walk over an ActionPlan
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §7. The plan executor:
//   1. Validates plan depth against maxPlanDepth
//   2. Walks nodes top-to-bottom
//   3. Gates each node before execution
//   4. Records an Observation per step
//   5. Stops on `final` and returns its result
//   6. On error: records the observation but continues — the next
//      tick of the agent gets to decide what to do about the failure
//      (Manus lesson: preserve failures, don't hide them)
//
// The executor is NOT the tick loop. It runs ONE plan to completion
// or to a `final` node. The tick loop (in execute.ts) calls the
// executor repeatedly until a final lands or maxTicks elapses.
//
// `ask_agent` delegation happens through the bus per DESIGN.md §3.3
// and §7.3: dispatch a request event, await a completion event,
// in-process registry short-circuit for performance. The runtime
// short-circuit calls executeAgent recursively but the contract is
// event-based (events still fire so subscribers see everything).

import type { Bus } from '../types';
import type {
  ActionPlan,
  PlanNode,
  Observation,
  UseToolNode,
  AskAgentNode,
  TellTopicNode,
  WaitNode,
  ReflectNode,
  ParallelNode,
} from '../schemas';
import type { Registry } from '../manifold/registry';
import type { Ledger } from '../manifold/ledger';
import type { ToolContext } from '../tool/define-tool';
import type { PolicyConfig } from '../schemas/policy.schema';
import type { StateStore } from '../store/types';
import type { CortexError } from '../errors/cortex.errors';
import { checkAgent, checkTool, type GateDecision } from './gate';
import { makeError } from '../errors/cortex.errors';
import { CortexTopics } from '../topics';

// Forward declaration to avoid circular import. The tick loop in
// execute.ts passes its own executeAgent function in here so the
// plan executor can recursively delegate without importing it.
export type ExecuteAgentForDelegation = (args: {
  agentId: string;
  input: unknown;
  workflowId: string;
  parentDepth: number;
}) => Promise<DelegationResult>;

export type DelegationResult =
  | { ok: true; data: unknown }
  | { ok: false; error: CortexError };

export type PlanExecutorDeps = {
  registry: Registry;
  ledger: Ledger;
  bus: Bus;
  stateStore: StateStore;
  delegate: ExecuteAgentForDelegation;
};

export type PlanExecutorInput = {
  plan: ActionPlan;
  agentId: string;
  workflowId: string;
  tick: number;
  depth: number;
  maxPlanDepth: number;
  policy?: PolicyConfig;
  abort?: AbortSignal;
};

export type PlanExecutorResult = {
  // True if the plan reached a `final` node and produced a result.
  // False means the plan ran to completion without finalizing — the
  // tick loop should call the agent again with the new observations.
  finalized: boolean;
  finalResult?: unknown;
  observations: Observation[];
};

const now = (): number => Date.now();

const recordObservation = (bus: Bus, workflowId: string, observation: Observation): void => {
  bus.emit({
    topic: CortexTopics.observationRecorded,
    payload: observation,
    meta: { timestamp: now(), correlationId: workflowId, workflowId },
  });
};

const denialMessage = (decision: GateDecision): string => {
  if (decision.allowed) return '';
  const detail = decision.detail ? ` (${decision.detail})` : '';
  return `gate_denied:${decision.reason}${detail}`;
};

// ───────────────────────────────────────────────────────────
// Depth validation
// ───────────────────────────────────────────────────────────

const validateDepth = (nodes: ActionPlan, current: number, max: number): CortexError | undefined => {
  if (current > max) {
    return makeError('plan_depth_exceeded', `Plan exceeds max depth ${max}`);
  }
  for (const node of nodes) {
    if (node.kind === 'parallel') {
      const error = validateDepth(node.branches, current + 1, max);
      if (error) return error;
    }
  }
  return undefined;
};

// ───────────────────────────────────────────────────────────
// Per-node executors
// ───────────────────────────────────────────────────────────

const executeUseTool = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: UseToolNode,
): Promise<Observation> => {
  const start = now();
  const gate = checkTool({
    policy: input.policy,
    registry: deps.registry,
    ledger: deps.ledger,
    workflowId: input.workflowId,
    toolId: node.toolId,
  });
  if (!gate.allowed) {
    return {
      stepKind: 'use_tool',
      toolId: node.toolId,
      durationMs: now() - start,
      error: denialMessage(gate),
      timestamp: now(),
      workflowId: input.workflowId,
      depth: input.depth,
      tick: input.tick,
    };
  }
  const tool = deps.registry.requireTool(node.toolId);
  const ctx: ToolContext = {
    workflowId: input.workflowId,
    agentId: input.agentId,
    signal: input.abort ?? new AbortController().signal,
    bus: deps.bus,
  };
  try {
    const parsed = tool.config.input.safeParse(node.input);
    if (!parsed.success) {
      return {
        stepKind: 'use_tool',
        toolId: tool.toolId,
        durationMs: now() - start,
        error: `input_invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
        timestamp: now(),
        workflowId: input.workflowId,
        depth: input.depth,
        tick: input.tick,
      };
    }
    const result = await tool.config.execute(parsed.data, ctx);
    deps.ledger.addToolCall(input.workflowId);
    return {
      stepKind: 'use_tool',
      toolId: tool.toolId,
      durationMs: now() - start,
      result,
      timestamp: now(),
      workflowId: input.workflowId,
      depth: input.depth,
      tick: input.tick,
    };
  } catch (e) {
    return {
      stepKind: 'use_tool',
      toolId: tool.toolId,
      durationMs: now() - start,
      error: e instanceof Error ? e.message : String(e),
      timestamp: now(),
      workflowId: input.workflowId,
      depth: input.depth,
      tick: input.tick,
    };
  }
};

const executeAskAgent = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: AskAgentNode,
): Promise<Observation> => {
  const start = now();
  const targetId = node.agentId;
  const gate = checkAgent({
    policy: input.policy,
    registry: deps.registry,
    ledger: deps.ledger,
    workflowId: input.workflowId,
    agentId: targetId,
  });
  if (!gate.allowed) {
    return {
      stepKind: 'ask_agent',
      agentId: targetId,
      durationMs: now() - start,
      error: denialMessage(gate),
      timestamp: now(),
      workflowId: input.workflowId,
      depth: input.depth,
      tick: input.tick,
    };
  }
  // Delegate through the bus. The delegate callback dispatches
  // CortexTopics.executeRequested with its own correlationId and
  // awaits the completion — the manifold's execution handler picks
  // it up. No direct emit here; the delegate owns the dispatch.
  const result = await deps.delegate({
    agentId: targetId,
    input: node.input,
    workflowId: input.workflowId,
    parentDepth: input.depth,
  });
  if (!result.ok) {
    return {
      stepKind: 'ask_agent',
      agentId: targetId,
      durationMs: now() - start,
      error: result.error.message,
      timestamp: now(),
      workflowId: input.workflowId,
      depth: input.depth,
      tick: input.tick,
    };
  }
  return {
    stepKind: 'ask_agent',
    agentId: targetId,
    durationMs: now() - start,
    result: result.data,
    timestamp: now(),
    workflowId: input.workflowId,
    depth: input.depth,
    tick: input.tick,
  };
};

const executeTellTopic = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: TellTopicNode,
): Promise<Observation> => {
  const start = now();
  deps.bus.emit({
    topic: node.topic,
    payload: node.payload,
    meta: { timestamp: now(), correlationId: input.workflowId, workflowId: input.workflowId },
  });
  return {
    stepKind: 'tell_topic',
    topic: node.topic,
    durationMs: now() - start,
    timestamp: now(),
    workflowId: input.workflowId,
    depth: input.depth,
    tick: input.tick,
  };
};

const executeWait = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: WaitNode,
): Promise<Observation> => {
  const start = now();
  const topic = node.topic;
  const timeoutMs = node.timeoutMs ?? 30_000;
  try {
    const event = await deps.bus.waitFor(topic, {
      timeoutMs,
      ...(input.abort && { signal: input.abort }),
    });
    return {
      stepKind: 'wait',
      topic,
      durationMs: now() - start,
      result: event.payload,
      timestamp: now(),
      workflowId: input.workflowId,
      depth: input.depth,
      tick: input.tick,
    };
  } catch (e) {
    return {
      stepKind: 'wait',
      topic,
      durationMs: now() - start,
      error: e instanceof Error ? e.message : String(e),
      timestamp: now(),
      workflowId: input.workflowId,
      depth: input.depth,
      tick: input.tick,
    };
  }
};

const executeReflect = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: ReflectNode,
): Promise<Observation> => {
  const start = now();
  const content = node.content;
  // Append to a scratch list in the workflow state store. The history
  // / observations producers do not surface scratch directly — that's
  // intentional. Future producers can read from this key.
  const key = 'cortex.scratch.reflections';
  const existing = (await deps.stateStore.get(input.workflowId, key)) ?? [];
  const list = Array.isArray(existing) ? existing : [];
  list.push({ content, tick: input.tick, timestamp: now() });
  await deps.stateStore.set(input.workflowId, key, list);
  return {
    stepKind: 'reflect',
    durationMs: now() - start,
    result: { content },
    timestamp: now(),
    workflowId: input.workflowId,
    depth: input.depth,
    tick: input.tick,
  };
};

const executeParallel = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: ParallelNode,
): Promise<{ observations: Observation[]; finalized: boolean; finalResult?: unknown }> => {
  const branches = node.branches;
  const maxConcurrency = node.maxConcurrency;
  // Each branch is a SINGLE node, not a sub-plan. We wrap it in an
  // array so we can reuse runPlanInner with depth+1.
  const childInput = (branchPlan: ActionPlan): PlanExecutorInput => ({
    ...input,
    plan: branchPlan,
    depth: input.depth + 1,
  });
  const tasks = branches.map((branch) => async () => runPlanInner(deps, childInput([branch])));
  // Naive concurrency limiter — chunk if maxConcurrency is set.
  const results: PlanExecutorResult[] = [];
  if (maxConcurrency && maxConcurrency > 0) {
    for (let i = 0; i < tasks.length; i += maxConcurrency) {
      const chunk = tasks.slice(i, i + maxConcurrency).map((t) => t());
      results.push(...(await Promise.all(chunk)));
    }
  } else {
    results.push(...(await Promise.all(tasks.map((t) => t()))));
  }
  const observations = results.flatMap((r) => r.observations);
  // If any branch finalized, propagate the FIRST one.
  const finalBranch = results.find((r) => r.finalized);
  if (finalBranch) {
    return { observations, finalized: true, finalResult: finalBranch.finalResult };
  }
  return { observations, finalized: false };
};

// ───────────────────────────────────────────────────────────
// Plan walker (recursive — used by parallel branches)
// ───────────────────────────────────────────────────────────

const runPlanInner = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
): Promise<PlanExecutorResult> => {
  const observations: Observation[] = [];
  for (const raw of input.plan) {
    if (input.abort?.aborted) {
      observations.push({
        stepKind: 'use_tool',
        durationMs: 0,
        error: 'aborted',
        timestamp: now(),
        workflowId: input.workflowId,
        depth: input.depth,
        tick: input.tick,
      });
      return { finalized: false, observations };
    }
    const node: PlanNode = raw;
    let observation: Observation | undefined;
    if (node.kind === 'use_tool') {
      observation = await executeUseTool(deps, input, node);
    } else if (node.kind === 'ask_agent') {
      observation = await executeAskAgent(deps, input, node);
    } else if (node.kind === 'tell_topic') {
      observation = await executeTellTopic(deps, input, node);
    } else if (node.kind === 'wait') {
      observation = await executeWait(deps, input, node);
    } else if (node.kind === 'reflect') {
      observation = await executeReflect(deps, input, node);
    } else if (node.kind === 'parallel') {
      const result = await executeParallel(deps, input, node);
      for (const obs of result.observations) {
        observations.push(obs);
        recordObservation(deps.bus, input.workflowId, obs);
      }
      if (result.finalized) {
        return { finalized: true, finalResult: result.finalResult, observations };
      }
      continue;
    } else {
      // node.kind === 'final'
      const finalResult = node.result;
      const obs: Observation = {
        stepKind: 'final',
        durationMs: 0,
        result: finalResult,
        timestamp: now(),
        workflowId: input.workflowId,
        depth: input.depth,
        tick: input.tick,
      };
      observations.push(obs);
      recordObservation(deps.bus, input.workflowId, obs);
      return { finalized: true, finalResult, observations };
    }
    if (observation) {
      observations.push(observation);
      recordObservation(deps.bus, input.workflowId, observation);
    }
  }
  return { finalized: false, observations };
};

// ───────────────────────────────────────────────────────────
// Public entry point
// ───────────────────────────────────────────────────────────

export const runPlan = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
): Promise<PlanExecutorResult & { error?: CortexError }> => {
  // Depth validation runs once at the top.
  const depthError = validateDepth(input.plan, input.depth, input.maxPlanDepth);
  if (depthError) {
    return { finalized: false, observations: [], error: depthError };
  }
  return runPlanInner(deps, input);
};
