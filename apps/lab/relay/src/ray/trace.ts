import type { CortexEvent, ToolDefinition, ToolObservation, ToolResultHook } from '@niscorp/cortex';

// ═══════════════════════════════════════════════════════════
// Ray's tool-call trace — the live store + the event wiring that feeds it.
//
// v2: no tool wrapping. Cortex emits `tool-start` BEFORE a call runs and
// `tool-end` with a typed observation when it settles; the wiring below maps
// those onto TraceSteps (status 'running' → 'done'/'error'). The Traced
// envelope (forModel / forInput / forTrace) survives as an onToolResult hook:
// the model sees `forModel`, the trace records `forInput`/`forTrace`.
// ═══════════════════════════════════════════════════════════

export type TraceStep = {
  tool: string;
  input: unknown;
  output?: unknown;
  ms?: number;
  status: 'running' | 'done' | 'error';
};

export type TraceSnapshot = { steps: TraceStep[]; running: boolean };

// A tool may return an envelope to route its result to different places: the
// agent sees `forModel` (the reply), the debug trace records `forInput` as the
// step's input and `forTrace` as its output (both optional — override the raw
// input / the model reply). A plain return goes everywhere. `visualize` uses this
// so the trace shows { intent, data } → { layout }, without the layout bloating
// the model's context.
export type Traced = { forModel: unknown; forInput?: unknown; forTrace?: unknown };
const isTraced = (x: unknown): x is Traced =>
  x !== null && typeof x === 'object' && 'forModel' in x;

let steps: TraceStep[] = [];
let running = false;
let snap: TraceSnapshot = { steps, running };
const subs = new Set<() => void>();

// New array identity each publish so useSyncExternalStore re-renders, even though
// the step objects themselves are mutated in place.
const rebuild = (): void => {
  snap = { steps: [...steps], running };
  for (const f of subs) f();
};

export const traceStore = {
  begin: (): void => {
    steps = [];
    running = true;
    rebuild();
  },
  start: (step: TraceStep): void => {
    steps.push(step);
    rebuild();
  },
  update: (): void => rebuild(),
  end: (): void => {
    running = false;
    rebuild();
  },
  subscribe: (cb: () => void): (() => void) => {
    subs.add(cb);
    return () => {
      subs.delete(cb);
    };
  },
  snapshot: (): TraceSnapshot => snap,
};

export type TraceWiring = {
  onEvent: (event: CortexEvent) => void;
  onToolResult: ToolResultHook<unknown>;
};

const observationOutput = (observation: ToolObservation): { output: unknown; error: boolean } => {
  switch (observation.kind) {
    case 'result':
      return { output: observation.result, error: false };
    case 'error':
      return { output: observation.error, error: true };
    case 'denied':
      return { output: `denied: ${observation.reason}`, error: true };
    case 'unknown-tool':
      return { output: 'unknown tool', error: true };
  }
};

// Wire a run's events into the live store + a per-message sink. `tools` supplies
// the id → display-name mapping (the trace shows the model-facing names).
// Nested runs (build_action forwards the builder's events) show up with their
// agentPath as a prefix — `action.builder · action.query` — and their retries
// as error lines, so a delegated build is never a black box.
export const traceWiring = (tools: ReadonlyArray<ToolDefinition>, sink: TraceStep[]): TraceWiring => {
  const nameOf = new Map(tools.map((tool) => [tool.config.id, tool.config.name]));
  const byCall = new Map<string, TraceStep>();
  const pathLabel = (event: CortexEvent): string =>
    event.agentPath.length > 1 ? `${event.agentPath.slice(1).join('›')} · ` : '';
  // Nested agents' tools aren't in Ray's name map — show the id's last
  // segment ('action.query' → 'query'; the path prefix carries the rest).
  const displayName = (toolId: string): string =>
    nameOf.get(toolId) ?? toolId.split('.').pop() ?? toolId;
  // Plain statements of what happened; the event's `issues` carries the
  // evidence (the rejected attempt / the stray text) into the step output.
  const retryLabel = (kind: 'output' | 'termination' | 'provider'): string => {
    if (kind === 'output') return 'result invalid — correction sent';
    if (kind === 'termination') return 'no result produced — correction sent';
    return 'tool call rejected by provider — correction sent';
  };

  return {
    onEvent: (event: CortexEvent): void => {
      if (event.type === 'tool-start') {
        const step: TraceStep = {
          tool: `${pathLabel(event)}${displayName(event.call.toolId)}`,
          input: event.call.args,
          status: 'running',
        };
        byCall.set(event.call.id, step);
        sink.push(step);
        traceStore.start(step);
        return;
      }
      if (event.type === 'retry') {
        // A retry isn't a tool call: the issues are its OUTCOME, not its
        // input. Recovered provider rejections render calm (they were
        // corrected in-loop), not as failures.
        const step: TraceStep = {
          tool: `${pathLabel(event)}${retryLabel(event.kind)}`,
          input: undefined,
          output: event.issues,
          status: event.kind === 'provider' ? 'done' : 'error',
        };
        sink.push(step);
        traceStore.start(step);
        return;
      }
      if (event.type === 'tool-end') {
        const step = byCall.get(event.observation.callId);
        if (!step) return;
        const { output, error } = observationOutput(event.observation);
        // The Traced hook may have already routed a trace-facing output.
        if (step.output === undefined) step.output = output;
        if (event.observation.kind === 'result' || event.observation.kind === 'error') {
          step.ms = event.observation.durationMs;
        }
        step.status = error ? 'error' : 'done';
        traceStore.update();
      }
    },
    // Unwrap the Traced envelope: route forInput/forTrace to the step,
    // hand the model only forModel.
    onToolResult: (observation) => {
      if (observation.kind !== 'result' || !isTraced(observation.result)) return;
      const routed = observation.result;
      const step = byCall.get(observation.callId);
      if (step) {
        if (routed.forInput !== undefined) step.input = routed.forInput;
        step.output = routed.forTrace !== undefined ? routed.forTrace : routed.forModel;
      }
      return { result: routed.forModel };
    },
  };
};
