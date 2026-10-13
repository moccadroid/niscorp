import type { ActionDefinition, ActionFragment, LayoutNode, Shell } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Emit } from '../runtime';
import type { DraftState } from './draft';
import type { ShellComposition, ShellConnection, ShellHostConfig, ShellOpening } from './types';

export type ShellLayouts = {
  layoutStore: Readonly<Record<string, LayoutNode>>;
  fragments: Readonly<Record<string, ActionFragment>>;
};

export const layoutsOf = (made: Pick<ShellComposition, 'layoutStore' | 'fragments'>): ShellLayouts => ({
  layoutStore: made.layoutStore ?? {},
  fragments: made.fragments ?? {},
});

// An action's layout is kept in the shell's layout store and named by ref:
// this is the definition as it was written, with the layout the store holds now.
export const withLayoutInPlace = (definition: ActionDefinition, store: Shell['layoutStore']): ActionDefinition => {
  const layout = definition.layout;
  return layout === undefined || typeof layout === 'string' ? definition : { ...definition, layout: store.resolveReferences(layout) };
};

export type Live = {
  shell: Shell;
  sessionShell: Shell;
  actionIds: ReadonlySet<string>;
  entries: ReadonlyMap<string, SeedEntry | SeedMutation> | undefined;
  layouts: ShellLayouts;
  slottedCanvases: ReadonlySet<string>;
  draft: DraftState;
  connections: Set<ShellConnection>;
  sentByCanvas: Map<string, string>;
  sentFrame?: string;
  deltaReady: Set<ShellConnection>;
  flushing: boolean;
  ended: boolean;
  builtAt: number;
  idleSince: number | null;
  seeded: Promise<void>;
};

export const canvasesOf = (live: Live): string[] => Object.keys(live.shell.getState().canvases);

// Every holder addresses a shell through its cell, so a reset that replaces
// `live` reaches them all.
export type Cell = {
  live: Live;
  token: string | null;
  principal: string | null;
  opening?: ShellOpening;
  resetting?: Promise<void>;
  // How many of the host's changes its shell reflects.
  changes: number;
};

export type HostState = {
  config: ShellHostConfig;
  emit: Emit | undefined;
  kept: boolean;
  delta: boolean;
  durable: Map<string, Cell>;
  building: Map<string, Promise<Cell>>;
  living: Map<Live, Cell>;
  // How many times what is in force has changed since the host was made.
  changes: number;
  // Has one shell take its draft as it is to be, for whoever changes the draft to wait on.
  adoptDraft: (live: Live, next: DraftState) => Promise<void>;
};

// Disposing stays with the caller: the shell of a session that signs out
// nobody is disposed when its last terminal leaves.
export const endShell = (host: HostState, live: Live): void => {
  live.ended = true;
  host.living.delete(live);
};
