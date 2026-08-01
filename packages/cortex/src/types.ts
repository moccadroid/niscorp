// ═══════════════════════════════════════════════════════════
// Cortex core types
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md: one loop, one output contract (the envelope),
// runtime-authored meta, typed observations. Types that need
// runtime validation live in schemas/; everything here is a
// hand-written contract.

import type {
  StepRequest,
  StepResult,
  StepStreamEvent,
  StreamOptions,
  CountInput,
  SignalDescription,
} from '@niscorp/signal';

// ───────────────────────────────────────────────────────────
// SignalClient — the slice of @niscorp/signal cortex needs
// ───────────────────────────────────────────────────────────
//
// Structural, so tests can pass a scripted stub. A real Signal
// instance satisfies this directly.

export type SignalClient = {
  step: (request: StepRequest) => Promise<StepResult>;
  stepStream: (request: StepRequest, options?: StreamOptions) => AsyncIterable<StepStreamEvent>;
  count: (input: CountInput) => Promise<number>;
  describe: () => SignalDescription;
};

// ───────────────────────────────────────────────────────────
// The envelope — every agent returns this shape
// ───────────────────────────────────────────────────────────
//
// `response` is human-facing text; `data` is the schema-typed
// payload (undefined for pure chat agents); `reasoning` is the
// model's own short WHY. Provider reasoning *tokens* are runtime
// telemetry and surface as model-delta events, never here.
// Run-level metadata (usage, strategy, attempts) is authored by
// cortex on RunMeta — models do not self-report metadata.

export type Envelope<TData> = {
  response?: string;
  data: TData;
  reasoning?: string;
};

// ───────────────────────────────────────────────────────────
// Usage / meta / results
// ───────────────────────────────────────────────────────────

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  // False when ANY step of the run was counted by signal rather than reported
  // by the provider. A run's total is then an estimate, and a consumer that
  // sums many runs should say so rather than presenting it as measured.
  reported: boolean;
};

export const EMPTY_USAGE: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, reported: true };

export const addUsage = (a: Usage, b: Usage): Usage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  totalTokens: a.totalTokens + b.totalTokens,
  reported: a.reported && b.reported,
});

// The envelope's TRANSPORT. The output contract is ALWAYS the JSON
// envelope; the transport only picks which channel its bytes travel:
// respond = tool-call arguments; emit = the content channel (the model
// emits the envelope as its completion); native = provider grammar.
// There is no mode in which the model "returns text". Resolution and
// mechanics are SIGNAL's (transport is provider knowledge) — cortex
// re-exports the name for its public meta/config surface.
export type OutputStrategy = import('@niscorp/signal').OutputTransport;

export type RunMeta = {
  usage: Usage;
  strategy: OutputStrategy;
  steps: number;
  outputRetries: number;
  elapsedMs: number;
};

export type StopReason = 'steps' | 'tokens' | 'duration' | 'output_retries' | 'custom';

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
  // Which stop condition fired. Present only when code === 'stopped'.
  stop?: StopReason;
  // The model's LAST semantically-invalid output (the raw routed value)
  // when the run died on output retries. A failed run's best candidate
  // is often repairable — callers may continue from it (edit mode)
  // instead of rebuilding from nothing.
  lastOutput?: unknown;
  cause?: unknown;
};

export type RunResult<TData> =
  | { ok: true; output: Envelope<TData>; meta: RunMeta }
  | { ok: false; error: CortexError; meta: RunMeta };

// Internal fallible-call contract (tool results, parses).
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: CortexError };

// ───────────────────────────────────────────────────────────
// Observations — the record of one tool call
// ───────────────────────────────────────────────────────────
//
// A discriminated union so consumers never cast. Denials and
// unknown tools are observations too: the model sees them as
// tool error results and reacts; the run does not fail.

export type ToolObservation =
  | { kind: 'result'; callId: string; toolId: string; args: unknown; result: unknown; durationMs: number }
  | { kind: 'error'; callId: string; toolId: string; args: unknown; error: string; durationMs: number }
  | { kind: 'denied'; callId: string; toolId: string; args: unknown; reason: string }
  | { kind: 'unknown-tool'; callId: string; toolId: string; args: unknown };

// ───────────────────────────────────────────────────────────
// Misc
// ───────────────────────────────────────────────────────────

export type Unsubscribe = () => void;
