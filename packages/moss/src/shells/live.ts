import type { ActionFragment, LayoutNode, Shell } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Emit } from '../runtime';
import type { ShellComposition, ShellHostConfig } from './config';
import type { ShellConnection, ShellOpening } from './types';

// What one host holds while it stands: each living shell with what is attached
// to it, the cell a principal's shell is addressed through, and what every
// part of the host reads. The files beside this one do the work.

// THE SHELL'S OWN LAYOUTS, as a composition answers them: the frame that
// arranges its canvases, what each `{ ref }` in the frame resolves to before
// anything sets it, and the fragments an action may be composed with. An
// empty record where the composition named none.
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
  // The ids of the actions this host registered on the shell: what its
  // principal held when it was built, or when it last adopted. An adopt
  // removes the ones that left. What app code registered on the shell itself
  // is not among them, and is not the host's to remove.
  held: ReadonlySet<string>;
  // The entries its composition answered, when it was built or last adopted:
  // what a read on one of its screens replays (./snapshot.ts asks whether one
  // keeps answering). Undefined: the composition named none, and nothing is
  // concluded from that.
  entries: ReadonlyMap<string, SeedEntry | SeedMutation> | undefined;
  // Its own layouts as its composition last answered them: what it was built
  // with, or what it last adopted. An adopt puts in place the ones that are
  // answered differently now, and compares against these to know which.
  layouts: ShellLayouts;
  connections: Set<ShellConnection>;
  // last frame per canvas — only changes are sent
  sent: Map<string, string>;
  // last FRAME (the arrangement) sent to the set — the frame's own `sent`
  // baseline, so a `setLayout` re-sends it only when it actually changed.
  sentFrame?: string;
  // Connections that asked for deltas at attach. Every connection is level
  // with `sent` (attach hands a newcomer the current frames, and a change
  // fans out to all of them), so one baseline serves the whole set — but a
  // connection that has NOT asked still gets whole frames from the same pass.
  deltaReady: Set<ShellConnection>;
  flushing: boolean;
  // set when the session ends (sign-out, reset, eviction, the last terminal of
  // a shell that is not kept leaving) — pending flush passes must not render
  // a disposed shell. Set by `endShell`, below, and by nothing else.
  ended: boolean;
  // built at; and when the last connection left (null while attached)
  since: number;
  idleSince: number | null;
  // Resolves when the manifest's `seeds` have been pushed (at once when there
  // are none). A snapshot waits on it: seeds land a tick after the build, and
  // a document rendered before them would be missing the screen's cards.
  seeded: Promise<void>;
};

// THE CANVASES A SHELL HAS, asked of the shell: the ones it was built with,
// in the order it was given them, and whatever it gained or lost since. Every
// part of the host that goes over a shell's canvases goes over these. The
// manifest's list says what a shell starts with, and is read once, to build it.
export const canvasesOf = (live: Live): string[] => Object.keys(live.shell.getState().canvases);

// The indirection `reset` needs. A session, a socket and the durable map all
// address a principal's shell through ONE mutable cell, so replacing the
// shell reaches every holder at once and nobody is left pointing at a
// disposed one. The token is kept beside it because a rebuild has to
// re-authorize the server's own wire as the same session, and it is
// refreshed on reattach so a rebuild uses the newest one the principal
// arrived with rather than the one they first appeared with.
export type Cell = {
  live: Live;
  token: string | null;
  principal: string | null;
  // What the shell was opened with, beside who it is for (the id seed, the
  // inputs a page's path carries): part of what it is rebuilt from. A kept
  // shell is opened with neither.
  opening?: ShellOpening;
  // The reset of this cell that is under way, or the last one that ran. The
  // next one waits for it.
  resetting?: Promise<void>;
  // WHICH ASKING ITS SHELL IS LEVEL WITH: the place, among every asking of
  // what a principal holds that the host made for an adopt (`HostParts.asked`),
  // of the one whose answer was last put in place. An answer to an earlier
  // asking that arrives afterwards is older, and is not put in its place.
  // Undefined: the cell has adopted nothing yet.
  level?: number;
};

// WHAT EVERY PART OF ONE HOST READS, settled once when the host is created:
// what it was handed, and what it worked out from that.
export type HostParts = {
  config: ShellHostConfig;
  // Where a span goes. Undefined when the host was handed no sink: then none
  // is built.
  emit: Emit | undefined;
  // Whether a principal's shell is kept (`ShellHostConfig.kept`).
  kept: boolean;
  // Whether a changed canvas may be sent as a delta (`ShellLimits.delta`).
  delta: boolean;
  // principal → the one living shell
  durable: Map<string, Cell>;
  // EVERY LIVING SHELL THIS HOST BUILT, each with the cell it is addressed
  // through: the kept ones, which `durable` also finds by principal, and the
  // ones built for one connection, which nothing else of the host holds. A
  // shell is put here when its build lands and taken out where it ends
  // (`endShell`). So what is walked to bring every shell level with a change,
  // or to reset somebody's, is the shells that live and no other.
  living: Map<Live, Cell>;
  // EVERY BUILD UNDER WAY, of a shell that will be kept and of one that will
  // not, each until it lands or fails. What lands after a change was built
  // from what its principal held before it, and adopts when it lands.
  underWay: Set<Promise<Cell>>;
  // HOW MANY TIMES THE HOST HAS ASKED WHAT A PRINCIPAL HOLDS, FOR AN ADOPT.
  // Each asking takes the next number, so of two answers for one cell the one
  // with the higher number was asked later (`Cell.level`).
  asked: number;
};

// A SHELL ENDS HERE, AND NOTHING ELSE SETS `ended`. It is marked, so a pass
// that is pending does not render a shell that is gone; and it is let go, so
// the host holds nothing of a shell that has ended. Disposing the shell stays
// with whoever ends it: a session that signs out nobody is disposed by its
// last terminal leaving, not here.
export const endShell = (host: HostParts, live: Live): void => {
  live.ended = true;
  host.living.delete(live);
};
