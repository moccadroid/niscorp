// ═══════════════════════════════════════════════════════════════
// The manifest — what exists for somebody.
//
// The second question moss asks of a request, once it knows who is calling:
// what does the application consist of, and which part of it is theirs.
//
// WHAT AN APP HANDS OVER is a type (./app.ts): the charter, the actions, the
// layout variants, the shell and the pages, and the seams an app fills in.
//
// WHAT A SET OF ROLES HOLDS of it (./roles.ts) is the charter applied: the
// action ids granted, and the layout variant held of each.
//
// WHETHER IT MAY BE SERVED is one verification (./verify.ts), asked at boot and
// at every change: the charter, with what each role's actions reach audited
// (./closure.ts), every entry's reach, the layout variants.
//
// WHEN IT CHANGES, every other process finds out by a pointer in the database
// that each one polls (./generation.ts).
//
// This module imports `runtime` and `identity`, and nothing else of moss.
// ═══════════════════════════════════════════════════════════════

export { defineApp } from './app';
export type {
  CanvasSeed,
  FactIntake,
  FunctionSession,
  LayoutVariant,
  NiscApp,
  PageManifest,
  RunRecord,
  RunSink,
  RunTurn,
  ShellCanvas,
  ShellManifest,
  StorePress,
} from './app';
export { auditClosure } from './closure';
export { DEFAULT_GENERATION_POLL_MS, GENERATION_DDL, createGeneration } from './generation';
export type { Generation } from './generation';
export { catalogFor, resolveCatalog, resolveVariants, resolveVariantsForRoles, wearableOf } from './roles';
export type { Catalog, InstalledOnly } from './roles';
export { refusalOf, verifyManifest, verifyVariants } from './verify';
export type { ManifestCandidate, ManifestCheck, ManifestReport } from './verify';
