// @niscorp/strata — the core: the grammar of a migration, the plan, the errors.
// Pure and storage-blind; `@niscorp/strata/postgres` applies a plan to a database.

import type { Sequence } from './schema';

export { SequenceSchema, MigrationSchema, StepSchema, SqlStepSchema, DocumentStepSchema, DocumentKindSchema, SEQUENCE_ID, MIGRATION_REF, KIND_NAME, KIND_REF, EMBED_PATH } from './schema';
export type { Sequence, Migration, Step, SqlStep, DocumentStep, DocumentKind } from './schema';
export { createUpgrader } from './documents';
export type { Stamp, Location, Transform, Upgrader, UpgradeResult } from './documents';
export { prepare, planMigrations, refuseProblems, orderPending } from './plan';
export type { Plan, Problem, PreparedMigration, PreparedSequence, LedgerRow } from './plan';
export { checksumOf } from './checksum';
export { sqlSteps } from './sql';
export { StrataError } from './errors';
export type { StrataErrorCode } from './errors';

// Authoring helper: a sequence, type-checked where it is written. Parsing
// happens where it is applied (`prepare`), like every other artifact.
export const defineSequence = <const T extends Sequence>(sequence: T): T => sequence;
