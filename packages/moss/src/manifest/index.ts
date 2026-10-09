// ═══════════════════════════════════════════════════════════════
// The manifest — what exists for somebody.
//
// The second question moss asks of a request, once it knows who is calling:
// what does the application consist of, and which part of it is theirs.
//
// WHAT AN APP HANDS OVER is a type (./app.ts): the charter, the actions, the
// layout variants, the shell and the pages, and the seams an app fills in. It
// is read by a schema when it is handed over (./handover.ts, ./schema.ts), and
// a manifest that does not parse refuses the boot.
//
// WHAT IT CONSISTS OF RIGHT NOW has one owner (./running.ts): what was shipped
// and the sets of actions that arrive while it runs, changed in one place and
// only to something that may be served.
//
// WHETHER IT MAY BE SERVED is one verification (./verify.ts), asked at boot, at
// every change and before a bundle is let in: the charter, with what each
// role's actions reach audited (./closure.ts), every entry's reach, the layout
// variants.
//
// WHAT A SET OF ROLES HOLDS of it (./roles.ts) is the charter applied: the
// action ids granted, and the layout variant held of each, remembered until
// the manifest changes.
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
export { GENERATION_DDL } from './generation';
export { receiveManifest } from './handover';
export { resolveVariants } from './roles';
export type { Catalog, InstalledOnly } from './roles';
export { createRunningManifest } from './running';
export type { RunningManifest, RunningManifestConfig } from './running';
export { refusalOf, verifyApp } from './verify';
export type { ManifestReport, ShippedManifest } from './verify';
