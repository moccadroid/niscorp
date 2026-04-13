// ═══════════════════════════════════════════════════════════
// Plan executor — depth-first walk over an ActionPlan
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §7. The plan executor:
//   1. Validates plan depth against maxPlanDepth
//   2. Walks nodes top-to-bottom
//   3. Gates each node before execution (reads live policy from WorkflowContext)
//   4. Records an Observation per step
//   5. Stops on `final` and returns its result
//   6. On error: records the observation but continues — the next
//      tick of the agent gets to decide what to do about the failure
//      (Manus lesson: preserve failures, don't hide them)
//
// The executor is NOT the tick loop. It runs ONE plan to completion
// or to a `final` node. The tick loop (in execute.ts) calls the
// executor repeatedly until a final lands or maxTicks elapses.

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
import type { WorkflowContext } from '../manifold/workflow-context';
import type { StateStore } from '../store/types';
import type { CortexError } from '../errors/cortex.errors';
import { checkAgent, checkTool, type GateDecision } from './gate';
import { makeError } from '../errors/cortex.errors';
import { recordObservation } from '../utils/observation';
import { withTimeout, DEFAULT_TOOL_TIMEOUT_MS } from '../utils/timeout';

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
  workflow: WorkflowContext;
  agentId: string;
  tick: number;
  depth: number;
  maxPlanDepth: number;
};

export type PlanExecutorResult = {
  finalized: boolean;
  finalResult?: unknown;
  observations: Observation[];
};

const now = (): number => Date.now();

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
// Gate input builder — shared mutable references, always fresh
// ───────────────────────────────────────────────────────────

const gateFor = (deps: PlanExecutorDeps, input: PlanExecutorInput) => ({
  workflow: input.workflow,
  registry: deps.registry,
  ledger: deps.ledger,
});

// ───────────────────────────────────────────────────────────
// Per-node executors
// ───────────────────────────────────────────────────────────

const executeUseTool = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  node: UseToolNode,
): Promise<Observation> => {
  const start = now();
  const workflowId = input.workflow.workflowId;
  const gate = checkTool({ ...gateFor(deps, input), toolId: node.toolId });
  if (!gate.allowed) {
    return {
      stepKind: 'use_tool',
      toolId: node.toolId,
      durationMs: now() - start,
      error: denialMessage(gate),
      timestamp: now(),
      workflowId,
      depth: input.depth,
      tick: input.tick,
    };
  }
  const tool = deps.registry.requireTool(node.toolId);
  const ctx: ToolContext = {
    workflowId,
    agentId: input.agentId,
    signal: input.workflow.abort.signal,
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
        workflowId,
        depth: input.depth,
        tick: input.tick,
      };
    }
    const timeout = node.timeoutMs ?? tool.config.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
    const result = await withTimeout(
      tool.config.execute(parsed.data, ctx),
      timeout,
      `tool ${node.toolId}`,
    );
    deps.ledger.addToolCall(workflowId);
    return {
      stepKind: 'use_tool',
      toolId: tool.toolId,
      durationMs: now() - start,
      result,
      timestamp: now(),
      workflowId,
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
      workflowId,
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
  const workflowId = input.workflow.workflowId;
  const targetId = node.agentId;
  const gate = checkAgent({ ...gateFor(deps, input), agentId: targetId });
  if (!gate.allowed) {
    return {
      stepKind: 'ask_agent',
      agentId: targetId,
      durationMs: now() - start,
      error: denialMessage(gate),
      timestamp: now(),
      workflowId,
      depth: input.depth,
      tick: input.tick,
    };
  }
  const result = await deps.delegate({
    agentId: targetId,
    input: node.input,
    workflowId,
    parentDepth: input.depth,
  });
  if (!result.ok) {
    return {
      stepKind: 'ask_agent',
      agentId: targetId,
      durationMs: now() - start,
      error: result.error.message,
      timestamp: now(),
      workflowId,
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
    workflowId,
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
  const workflowId = input.workflow.workflowId;
  deps.bus.emit({
    topic: node.topic,
    payload: node.payload,
    meta: { timestamp: now(), correlationId: workflowId, workflowId },
  });
  return {
    stepKind: 'tell_topic',
    topic: node.topic,
    durationMs: now() - start,
    timestamp: now(),
    workflowId,
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
  const workflowId = input.workflow.workflowId;
  const topic = node.topic;
  const timeoutMs = node.timeoutMs ?? 30_000;
  try {
    const event = await deps.bus.waitFor(topic, {
      timeoutMs,
      signal: input.workflow.abort.signal,
    });
    return {
      stepKind: 'wait',
      topic,
      durationMs: now() - start,
      result: event.payload,
      timestamp: now(),
      workflowId,
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
      workflowId,
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
  const workflowId = input.workflow.workflowId;
  const content = node.content;
  const key = 'cortex.scratch.reflections';
  const existing = (await deps.stateStore.get(workflowId, key)) ?? [];
  const list = Array.isArray(existing) ? existing : [];
  list.push({ content, tick: input.tick, timestamp: now() });
  await deps.stateStore.set(workflowId, key, list);
  return {
    stepKind: 'reflect',
    durationMs: now() - start,
    result: { content },
    timestamp: now(),
    workflowId,
    depth: input.depth,
    tick: input.tick,
  };
};

const executeParallel = async (
  deps: PlanExecutorDeps,
  input: PlanExecutorInput,
  idempotencyCache: Map<string, Observation>,
  node: ParallelNode,
): Promise<{ observations: Observation[]; finalized: boolean; finalResult?: unknown }> => {
  const branches = node.branches;
  const maxConcurrency = node.maxConcurrency;
  const childInput = (branchPlan: ActionPlan): PlanExecutorInput => ({
    ...input,
    plan: branchPlan,
    depth: input.depth + 1,
  });
  const tasks = branches.map((branch) => async () => runPlanInner(deps, childInput([branch]), idempotencyCache));
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
  idempotencyCache: Map<string, Observation>,
): Promise<PlanExecutorResult> => {
  const workflowId = input.workflow.workflowId;
  const observations: Observation[] = [];
  for (const raw of input.plan) {
    if (input.workflow.abort.signal.aborted) {
      observations.push({
        stepKind: 'use_tool',
        durationMs: 0,
        error: 'aborted',
        timestamp: now(),
        workflowId,
        depth: input.depth,
        tick: input.tick,
      });
      return { finalized: false, observations };
    }
    const node: PlanNode = raw;

    // Idempotency: if the node has a key and we've already executed
    // it in this runPlan call, return the cached observation.
    const hasMetaKey = node.kind === 'use_tool' || node.kind === 'ask_agent' || node.kind === 'tell_topic' || node.kind === 'wait';
    const idemKey = hasMetaKey ? node.idempotencyKey : undefined;
    if (idemKey) {
      const cached = idempotencyCache.get(idemKey);
      if (cached) {
        observations.push(cached);
        recordObservation(deps.bus, workflowId, cached);
        continue;
      }
    }

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
      const result = await executeParallel(deps, input, idempotencyCache, node);
      for (const obs of result.observations) {
        observations.push(obs);
        recordObservation(deps.bus, workflowId, obs);
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
        workflowId,
        depth: input.depth,
        tick: input.tick,
      };
      observations.push(obs);
      recordObservation(deps.bus, workflowId, obs);
      return { finalized: true, finalResult, observations };
    }
    if (observation) {
      if (idemKey) idempotencyCache.set(idemKey, observation);
      observations.push(observation);
      recordObservation(deps.bus, workflowId, observation);
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
  const depthError = validateDepth(input.plan, input.depth, input.maxPlanDepth);
  if (depthError) {
    return { finalized: false, observations: [], error: depthError };
  }
  const idempotencyCache = new Map<string, Observation>();
  return runPlanInner(deps, input, idempotencyCache);
};
