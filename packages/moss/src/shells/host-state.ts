import type { ActionFragment, LayoutNode, Shell } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Emit } from '../runtime';
import type { ShellComposition, ShellHostConfig } from './config';
import type { ShellConnection, ShellOpening } from './types';

export type ShellLayouts = {
  frame?: LayoutNode;
  layoutStore: Readonly<Record<string, LayoutNode>>;
  fragments: Readonly<Record<string, ActionFragment>>;
};

export const layoutsOf = (made: Pick<ShellComposition, 'frame' | 'layoutStore' | 'fragments'>): ShellLayouts => ({
  ...(made.frame !== undefined ? { frame: made.frame } : {}),
  layoutStore: made.layoutStore ?? {},
  fragments: made.fragments ?? {},
});

export type Live = {
  shell: Shell;
  sessionShell: Shell;
  held: ReadonlySet<string>;
  entries: ReadonlyMap<string, SeedEntry | SeedMutation> | undefined;
  layouts: ShellLayouts;
  connections: Set<ShellConnection>;
  sent: Map<string, string>;
  sentFrame?: string;
  deltaReady: Set<ShellConnection>;
  flushing: boolean;
  ended: boolean;
  since: number;
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
};

// Disposing stays with the caller: the shell of a session that signs out
// nobody is disposed when its last terminal leaves.
export const endShell = (host: HostState, live: Live): void => {
  live.ended = true;
  host.living.delete(live);
};
