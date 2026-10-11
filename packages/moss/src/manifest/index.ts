// ═══════════════════════════════════════════════════════════════
// The manifest — what exists for somebody.
//
// The second question moss asks of a request, once it knows who is calling:
// what does the application consist of, and which part of it is theirs.
//
// WHAT AN APP HANDS OVER is a type (./app.ts): the charter, the actions, the
// layout variants, the shell and the pages, and the seams an app fills in. It
// is read by a schema when it is handed over (./handover.ts, ./schema.ts), and
// a manifest that does not parse refuses the boot. Then it is frozen: it is
// not the app's to edit any more.
//
// WHAT IT CONSISTS OF RIGHT NOW has one owner (./running.ts): what was shipped
// and the sets of actions that arrive while it runs, changed in one place and
// only to something that may be served.
//
// WHAT A SHELL IS MADE OF, FOR A SET OF ROLES, is that owner's one answer
// (./artifacts.ts): the actions they hold, the shell's frame and layout store,
// its fragments, and the entries. An action, a layout, a fragment and an entry
// reach a shell through that answer and through nothing else, so it is where
// whatever decides what an id resolves to will be asked.
//
// WHICH ENTRIES AN APP SERVES is said by one function (./entries.ts). The
// running manifest holds what it answers while a server runs; the step that
// migrates before one starts asks the function itself.
//
// WHETHER IT MAY BE SERVED is one verification (./verify.ts), asked at boot, at
// every change and before a bundle is let in: the charter, with what each
// role's actions reach audited (./closure.ts), every entry's reach, the layout
// variants.
//
// WHAT SOMEBODY ELSE WROTE is asked two more things before it is let in, by
// whoever lets it in: whether a layout composes what the kit has
// (./layout.ts), and which chains of steps never end (./verify.ts).
//
// WHAT A SET OF ROLES HOLDS of it (./roles.ts) is the charter applied: the
// action ids granted, and the layout variant held of each, remembered until
// the manifest changes.
//
// WHEN IT CHANGES, every other process finds out that it did, by a pointer in
// the database that each one polls (./generation.ts). It finds out what by
// reading again the sets it has a loader for; a set handed to one process
// with no loader is that process's alone.
//
// This module imports `identity` and `feature` (for the type of what
// `NiscApp.features` holds), and nothing else of moss.
// ═══════════════════════════════════════════════════════════════

export { defineApp } from './app';
export type {
  CanvasSeed,
  FunctionSession,
  LayoutVariant,
  NiscApp,
  PageManifest,
  RunRecord,
  RunSink,
  RunTurn,
  ShellCanvas,
  ShellManifest,
} from './app';
export type { ShellArtifacts } from './artifacts';
export { entriesOf } from './entries';
export type { Pointer } from './generation';
export { receiveManifest } from './handover';
export { layoutMisfits } from './layout';
export type { KitComponents } from './layout';
export { resolveVariants } from './roles';
export type { Catalog, InstalledOnly } from './roles';
export { createRunningManifest } from './running';
export type { ActionLoader, RunningManifest, RunningManifestConfig } from './running';
export { endlessChains, refusalOf, verifyApp } from './verify';
export type { EndlessChain, ManifestReport, ShippedManifest } from './verify';
