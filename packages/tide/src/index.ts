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
  RunTriggerSchema,
  ManualTriggerSchema,
  PolicySchema,
  RetrySchema,
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
  FactInput,
  FactKind,
  Op,
  Weekday,
} from './schemas';

// ── the ledger, the seams, the reports ──────────────────────────
export type {
  AttemptOutcome,
  EffectHandler,
  EffectRegistry,
  Fact,
  LoadReport,
  NewFact,
  PreviewCtx,
  PreviewReport,
  PreviewUnit,
  ReflexState,
  Retention,
  Row,
  Run,
  RunState,
  SelectCtx,
  SelectFn,
  Task,
  TaskState,
  AdvanceReport,
  TideConfig,
  TideCtx,
  TideEvent,
  TransformFn,
} from './types';

// ── the store contract ──────────────────────────────────────────
//
// Exported in full because a host writing its own store needs the whole
// grammar, not just the interface: `UNIQUE_BY` IS the set of exactly-once
// promises, and a store that does not enforce all four is not a tide store.
export { PRIMARY_KEY, UNIQUE_BY, COMPARISON_OPS } from './types';
export type {
  ClaimSpec,
  Comparison,
  Mutation,
  Order,
  QuerySpec,
  RemoveSpec,
  TableName,
  TideStore,
  TideTables,
  UniqueKey,
  Where,
} from './types';

export type { AdvanceOptions } from './engine/advance';
export type { PreviewOptions } from './engine/preview';
export type { GraphReport, Edge } from './engine/graph';

// ── occurrence math, exported because a host that renders a
// schedule needs the same answers the engine uses ───────────────
export { occurrencesBetween, occurrenceKey, zonedParts, zonedToUtc, daysInMonth } from './engine/occurrence';
export type { Occurrence, LocalParts, LocalDay } from './engine/occurrence';

export { versionOf } from './engine/runtime';
