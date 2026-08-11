// @niscorp/tide — a reflex turns the clock and the fact into one named
// effect, through a durable ledger. Host-blind: storage, selection,
// transformation, effects and identity are seams the host fills.

export { createTide } from './tide';
export type { Tide } from './tide';

export { TideError, isTideError } from './errors';
export type { TideErrorCode } from './errors';

export { createMemoryStore } from './store/memory';
export type { MemoryStore } from './store/memory';

// ── the grammar ─────────────────────────────────────────────────
export {
  ReflexSchema,
  SelectionSchema,
  EffectRefSchema,
  TriggerSchema,
  ClockTriggerSchema,
  ClockRecurringSchema,
  ClockOnceSchema,
  WriteTriggerSchema,
  SignalTriggerSchema,
  FiringTriggerSchema,
  PollTriggerSchema,
  ManualTriggerSchema,
  PolicySchema,
  RetrySchema,
  CoalesceSchema,
  FactInputSchema,
  FactKindSchema,
  ClockUnitSchema,
  OpSchema,
  WEEKDAYS,
} from './schemas';
export type {
  Reflex,
  ReflexInput,
  Selection,
  EffectRef,
  Trigger,
  Clock,
  ClockRecurring,
  ClockOnce,
  Policy,
  Retry,
  Coalesce,
  FactInput,
  FactKind,
  Op,
  Weekday,
} from './schemas';

// ── the ledger, the seams, the reports ──────────────────────────
export type {
  Attempt,
  AttemptOutcome,
  ClaimOptions,
  CoalesceWindow,
  Delivery,
  DeliveryOutcome,
  EffectHandler,
  EffectRegistry,
  Fact,
  Firing,
  FiringState,
  LoadReport,
  NewFact,
  PreviewCtx,
  PreviewReport,
  PreviewUnit,
  RecordResult,
  Retention,
  Row,
  SelectCtx,
  SelectFn,
  Task,
  TaskState,
  TickReport,
  TideConfig,
  TideCtx,
  TideEvent,
  TideStoreLike,
  TransformFn,
} from './types';

export type { TickOptions } from './engine/tick';
export type { PreviewOptions } from './engine/preview';
export type { GraphReport, Edge } from './engine/graph';

// ── occurrence math, exported because a host that renders a
// schedule needs the same answers the engine uses ───────────────
export { occurrencesBetween, occurrenceKey, zonedParts, zonedToUtc, daysInMonth } from './engine/occurrence';
export type { Occurrence, LocalParts, LocalDay } from './engine/occurrence';

export { versionOf } from './engine/runtime';
