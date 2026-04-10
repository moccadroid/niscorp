// ═══════════════════════════════════════════════════════════
// @niscorp/cortex — shared core types
// ═══════════════════════════════════════════════════════════
//
// Hand-written types per STYLE_GUIDE.md §Types: anything that does
// not need runtime validation lives here. Schemas (Zod) live in src/schemas.
//
// The types in this file are deliberately minimal — most subsystems
// own their own types. Anything imported by more than one subsystem
// is a candidate for living here.

// ───────────────────────────────────────────────────────────
// Bus / events
// ───────────────────────────────────────────────────────────

export type EventMeta = {
  timestamp: number;
  correlationId: string;
  causationId?: string;
  workflowId?: string;
};

export type BusEvent = {
  topic: string;
  payload: unknown;
  meta: EventMeta;
};

export type BusHandler = (event: BusEvent) => void | Promise<void>;
export type Unsubscribe = () => void;

export type WaitForOptions = {
  timeoutMs?: number;
  filter?: (event: BusEvent) => boolean;
  signal?: AbortSignal;
};

export type Bus = {
  emit: (event: BusEvent) => void;
  on: (pattern: string, handler: BusHandler) => Unsubscribe;
  waitFor: (pattern: string, options?: WaitForOptions) => Promise<BusEvent>;
  dispatch: (topic: string, payload: unknown, meta?: Partial<EventMeta>) => string;
};

// ───────────────────────────────────────────────────────────
// Result — for fallible APIs (programmer errors throw)
// ───────────────────────────────────────────────────────────

export type Result<T, E = CortexError> =
  | { ok: true; data: T }
  | { ok: false; error: E };

// ───────────────────────────────────────────────────────────
// Errors (re-exported here so dependents avoid a cycle)
// ───────────────────────────────────────────────────────────

export type ErrorCode =
  | 'agent_not_registered'
  | 'tool_not_registered'
  | 'invalid_plan'
  | 'plan_depth_exceeded'
  | 'ticks_exceeded'
  | 'tool_iterations_exceeded'
  | 'duration_exceeded'
  | 'budget_exceeded'
  | 'gate_denied'
  | 'tool_execution_failed'
  | 'output_validation_failed'
  | 'model_call_failed'
  | 'aborted'
  | 'timeout'
  | 'unknown';

export type CortexError = {
  code: ErrorCode;
  message: string;
  workflowId?: string;
  agentId?: string;
  cause?: unknown;
};

// ───────────────────────────────────────────────────────────
// Budget / ledger view
// ───────────────────────────────────────────────────────────

export type BudgetState = {
  tokensUsed: number;
  tokensRemaining: number;
  ticksUsed: number;
  ticksRemaining: number;
  toolCallsUsed: number;
};

export type ReadonlyLedger = {
  snapshot: (workflowId: string) => BudgetState;
};
