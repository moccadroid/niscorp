import type {
  StepRequest,
  StepResult,
  StepStreamEvent,
  StreamOptions,
  CountInput,
  SignalDescription,
} from '@niscorp/signal';

export type SignalClient = {
  step: (request: StepRequest) => Promise<StepResult>;
  stepStream: (request: StepRequest, options?: StreamOptions) => AsyncIterable<StepStreamEvent>;
  count: (input: CountInput) => Promise<number>;
  describe: () => SignalDescription;
};

export type Envelope<TData> = {
  response?: string;
  data: TData;
  reasoning?: string;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  // False when any step's tokens were counted by signal rather than reported by
  // the provider: the totals are then an estimate.
  reported: boolean;
};

export const EMPTY_USAGE: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: true };

export const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  totalTokens: a.totalTokens + b.totalTokens,
  reported: a.reported && b.reported,
});

export type OutputStrategy = import('@niscorp/signal').OutputTransport;

export type RunMeta = {
  usage: Usage;
  strategy: OutputStrategy;
  steps: number;
  outputRetries: number;
  elapsedMs: number;
};

export type StopReason = 'steps' | 'tokens' | 'duration' | 'output_retries' | 'repeated_calls' | 'custom';

export type ErrorCode =
  | 'model_call_failed'
  | 'output_invalid'
  | 'stopped'
  | 'aborted'
  | 'unknown';

export type CortexError = {
  code: ErrorCode;
  message: string;
  runId: string;
  agentPath: ReadonlyArray<string>;
  stop?: StopReason;
  lastOutput?: unknown;
  cause?: unknown;
};

export type RunResult<TData> =
  | { ok: true; output: Envelope<TData>; meta: RunMeta }
  | { ok: false; error: CortexError; meta: RunMeta };

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: CortexError };

export type ToolObservation =
  | { kind: 'result'; callId: string; toolId: string; args: unknown; result: unknown; durationMs: number }
  | { kind: 'error'; callId: string; toolId: string; args: unknown; error: string; durationMs: number }
  | { kind: 'denied'; callId: string; toolId: string; args: unknown; reason: string }
  | { kind: 'unknown-tool'; callId: string; toolId: string; args: unknown };

export type Unsubscribe = () => void;
