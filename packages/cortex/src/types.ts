// ═══════════════════════════════════════════════════════════
// @niscorp/cortex — shared core types
// ═══════════════════════════════════════════════════════════

import type { TypedTopic } from './utils/typed-topic';

// ───────────────────────────────────────────────────────────
// Bus / events
// ───────────────────────────────────────────────────────────

export type EventMeta = {
  timestamp: number;
  correlationId: string;
  causationId?: string;
  workflowId?: string;
};

export type BusEvent<T = unknown> = {
  topic: string;
  payload: T;
  meta: EventMeta;
};

export type BusHandler<T = unknown> = (event: BusEvent<T>) => void | Promise<void>;
export type Unsubscribe = () => void;

export type WaitForOptions<T = unknown> = {
  timeoutMs?: number;
  filter?: (event: BusEvent<T>) => boolean;
  signal?: AbortSignal;
};

export type Bus = {
  emit: (event: BusEvent) => void;
  on: {
    <T>(topic: TypedTopic<T>, handler: BusHandler<T>): Unsubscribe;
    (pattern: string, handler: BusHandler): Unsubscribe;
  };
  waitFor: {
    <T>(topic: TypedTopic<T>, options?: WaitForOptions<T>): Promise<BusEvent<T>>;
    (pattern: string, options?: WaitForOptions): Promise<BusEvent>;
  };
  dispatch: (topic: string, payload: unknown, meta?: Partial<EventMeta>) => string;
};

// ───────────────────────────────────────────────────────────
// Result — for fallible APIs (programmer errors throw)
// ───────────────────────────────────────────────────────────

export type Result<T, E = CortexError> =
  | { ok: true; data: T }
  | { ok: false; error: E };

// ───────────────────────────────────────────────────────────
// Errors
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
