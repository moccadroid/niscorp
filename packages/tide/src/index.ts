export { createTide } from './tide';
export type { Tide } from './tide';

export { TideError, isTideError } from './errors';
export type { TideErrorCode } from './errors';

export { createMemoryStore } from './store/memory';
export type { MemoryStore } from './store/memory';

// The Postgres store is not exported here: it is `@niscorp/tide/postgres`, so
// that nothing this entry reaches imports strata.
export { createTideDriver } from './driver';
export type { TideDriver, TideDriverConfig } from './driver';

export {
  ReflexSchema,
  ReflexDraftSchema,
  draftSchemaOf,
  DRAFT_TRIGGERS,
  TimerSchema,
  TimerTriggerSchema,
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
  ReflexDraft,
  DraftChoice,
  DraftField,
  DraftTrigger,
  Timer,
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

export { occurrencesBetween, occurrenceKey, zonedParts, zonedToUtc, daysInMonth } from './engine/occurrence';
export { anchorDraft, timerMs } from './engine/anchor';
export type { Occurrence, LocalParts, LocalDay } from './engine/occurrence';

export { versionOf } from './engine/runtime';
