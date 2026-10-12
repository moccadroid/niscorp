import type { CortexEvent, ToolDefinition, ToolObservation, ToolResultHook } from '@niscorp/cortex';

export type TraceStep = {
  tool: string;
  input: unknown;
  output?: unknown;
  ms?: number;
  status: 'running' | 'done' | 'error';
};

export type Traced = { forModel: unknown; forInput?: unknown; forTrace?: unknown };
const isTraced = (x: unknown): x is Traced =>
  x !== null && typeof x === 'object' && 'forModel' in x;

export type TraceWiring = {
  onEvent: (event: CortexEvent) => void;
  onToolResult: ToolResultHook<unknown>;
};

// Steps are mutated in place as they settle, so an announcement copies them.
const snapshot = (sink: ReadonlyArray<TraceStep>): TraceStep[] => sink.map((step) => ({ ...step }));

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

export const traceWiring = (
  tools: ReadonlyArray<ToolDefinition>,
  sink: TraceStep[],
  onChange?: (steps: TraceStep[]) => void,
): TraceWiring => {
  const announce = (): void => onChange?.(snapshot(sink));
  const nameOf = new Map(tools.map((tool) => [tool.config.id, tool.config.name]));
  const byCall = new Map<string, TraceStep>();
  const pathLabel = (event: CortexEvent): string =>
    event.agentPath.length > 1 ? `${event.agentPath.slice(1).join('›')} · ` : '';
  const displayName = (toolId: string): string =>
    nameOf.get(toolId) ?? toolId.split('.').pop() ?? toolId;
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
        announce();
        return;
      }
      if (event.type === 'retry') {
        // A provider rejection is corrected in-loop, so it shows as done.
        const step: TraceStep = {
          tool: `${pathLabel(event)}${retryLabel(event.kind)}`,
          input: undefined,
          output: event.issues,
          status: event.kind === 'provider' ? 'done' : 'error',
        };
        sink.push(step);
        announce();
        return;
      }
      if (event.type === 'tool-end') {
        const step = byCall.get(event.observation.callId);
        if (!step) return;
        const { output, error } = observationOutput(event.observation);
        // The onToolResult hook may already have set the output.
        if (step.output === undefined) step.output = output;
        if (event.observation.kind === 'result' || event.observation.kind === 'error') {
          step.ms = event.observation.durationMs;
        }
        step.status = error ? 'error' : 'done';
        announce();
      }
    },
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
