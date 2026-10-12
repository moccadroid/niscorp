import type { Sequence } from './schema';

export { SequenceSchema, MigrationSchema, StepSchema, SqlStepSchema, DocumentStepSchema, DocumentKindSchema, SEQUENCE_ID, MIGRATION_REF, KIND_NAME, KIND_REF, EMBED_PATH } from './schema';
export type { Sequence, Migration, Step, SqlStep, DocumentStep, DocumentKind } from './schema';
export { createUpgrader } from './documents';
export type { Stamp, Location, Transform, Upgrader, UpgradeResult } from './documents';
export { prepare, planMigrations, refuseProblems, orderPending } from './plan';
export type { Plan, Problem, PreparedMigration, PreparedSequence, LedgerRow } from './plan';
export { checksumOf } from './checksum';
export { sqlSteps } from './sql';
export { DOCUMENT_DEPTH_LIMIT, exceedsDepth, depthRefusal } from './depth';
export { StrataError } from './errors';
export type { StrataErrorCode } from './errors';

export const defineSequence = <const T extends Sequence>(sequence: T): T => sequence;
