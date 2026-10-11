import type { ActionDefinition, ActionFragment, LayoutNode } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { ShellCanvas, ShellManifest } from './app';

// ═══════════════════════════════════════════════════════════════
// THE ARTIFACTS A SHELL IS MADE OF, FOR A SET OF ROLES — everything a shell
// loads that somebody authored, answered whole, by one owner: the running
// manifest (./running.ts, `artifactsFor`).
//
// Four kinds: the actions, the layouts, the fragments and the entries. Each
// was read where it was needed. The actions were asked of the running
// manifest; the frame, the layout store and the fragments were read off the
// shell's manifest by the server's wiring; the entries were held in a map of
// their own. So whatever is to decide which action, layout, fragment or entry
// an id resolves to had four modules to change. It has one function now: a
// shell is built from this answer and adopts it, and nothing else of moss
// reads one of the four off what the app handed over.
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
  // THE ENTRIES the app serves, by fingerprint: what a read or a write on one
  // of this shell's screens replays.
  entries: ReadonlyMap<string, SeedEntry | SeedMutation>;
  // Every component name a tree of this shell may mention, each with the
  // contract declared for it (./components.ts). Not an artifact: it is read
  // off the ones above, and it is here because it changes when they do.
  components: Readonly<Record<string, NonNullable<ShellManifest['components']>[string]>>;
};
