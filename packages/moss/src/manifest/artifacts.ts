import type { ActionDefinition, ActionFragment, LayoutNode } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { ShellCanvas, ShellManifest } from './app';

// ═══════════════════════════════════════════════════════════════
// THE ARTIFACTS A SHELL IS MADE OF, FOR A SET OF ROLES — everything a shell
// loads that somebody authored, answered whole, by one owner: the running
// manifest (./running.ts, `artifactsFor`).
//
// Four kinds: the actions, the layouts, the fragments and the entries. A shell
// is built from this answer and adopts it, and nothing else of moss reads one
// of the four off what the app handed over. So whatever decides which action,
// layout, fragment or entry an id resolves to, for what a SHELL IS HANDED, has
// this one function to change.
//
// FOR AN ENTRY THAT IS HALF OF IT. The entries in this answer are what a
// shell is told of the reads on its screens (whether one keeps answering).
// What a read REPLAYS is not asked here: a fingerprint resolves in vex's
// cache, into which the same list was copied at boot (../data, `Data.seed`),
// and which also holds what this answer does not (a query written while the
// app runs). So whatever comes to decide what a fingerprint resolves to has
// this function and that cache to change.
// ═══════════════════════════════════════════════════════════════

export type ShellArtifacts = {
  // THE ACTIONS a set of roles holds of the ones in force, by id: granted,
  // there for the install list, and each with the layout variant those roles
  // hold of it already in its place. One that is not here does not exist for
  // them.
  actions: Readonly<Record<string, ActionDefinition>>;
  // THE SHELL'S OWN LAYOUTS: its canvases with what each may mount first, the
  // frame that arranges them, and what a `{ ref }` in the frame resolves to
  // before anything sets it.
  canvases: readonly ShellCanvas[];
  frame?: LayoutNode;
  layoutStore?: Readonly<Record<string, LayoutNode>>;
  // THE FRAGMENTS an action may be composed with, by id.
  fragments?: Readonly<Record<string, ActionFragment>>;
  // THE ENTRIES the app shipped, by fingerprint: what a shell is told of a
  // read or a write on one of its screens. The replay itself resolves the
  // fingerprint in vex's cache, not here.
  entries: ReadonlyMap<string, SeedEntry | SeedMutation>;
  // Every component name a tree of this shell may mention, each with the
  // contract declared for it (./components.ts). Not an artifact: it is read
  // off the ones above, and it is here because it changes when they do.
  components: Readonly<Record<string, NonNullable<ShellManifest['components']>[string]>>;
};
