import type { ToolDefinition, ToolContext } from '@niscorp/cortex';

// ═══════════════════════════════════════════════════════════
// Ray's tool-call trace — the live store + the wrapper that feeds it.
//
// Each tool call is recorded the moment it's invoked (status 'running', input
// only); the same step object is mutated in place when the result lands (output +
// timing + status). The chat's debug view subscribes (useSyncExternalStore), so a
// call shows up immediately and fills in when it completes. Each finished Ray
// message also keeps its own copy of the trace (see run.ts).
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
  // A tool was just invoked — push it (status 'running'). Keep the ref; the caller
  // mutates it and calls update() when the result arrives.
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

// Wrap each tool's execute so every call records { tool, input, output, ms } —
// into the message's own trace (`sink`, returned with the reply) and the live
// store (so the chat streams steps as they happen). Always on; the debug toggle
// only controls whether RayTrace reveals the input/output JSON.
export const traced = (tools: ToolDefinition[], sink: TraceStep[]): ToolDefinition[] =>
  tools.map((t) => ({
    ...t,
    config: {
      ...t.config,
      execute: (input: unknown, ctx: ToolContext): unknown => {
        const started = Date.now();
        // Record the call immediately (status 'running', input only); the same
        // object lives in the message trace + the live store. Fill it when done.
        const step: TraceStep = { tool: t.config.name, input, status: 'running' };
        sink.push(step);
        traceStore.start(step);
        // Returns the model-facing value (unwrapping the envelope if the tool used
        // one); records the trace-facing input/output on the step.
        const finish = (output: unknown, error?: boolean): unknown => {
          const t = isTraced(output);
          if (t && output.forInput !== undefined) step.input = output.forInput;
          step.output = t ? (output.forTrace !== undefined ? output.forTrace : output.forModel) : output;
          step.ms = Date.now() - started;
          step.status = error ? 'error' : 'done';
          traceStore.update();
          return t ? output.forModel : output;
        };
        try {
          const out = t.config.execute(input, ctx);
          if (out instanceof Promise) {
            return out.then(
              (o) => finish(o),
              (e: unknown) => {
                finish(String((e as Error)?.message ?? e), true);
                throw e;
              },
            );
          }
          return finish(out);
        } catch (e) {
          finish(String((e as Error).message), true);
          throw e;
        }
      },
    },
  }));
