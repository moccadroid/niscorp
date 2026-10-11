import type { Shell } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import type { Emit } from '../runtime';
import type { ShellHostConfig } from './config';
import type { ShellConnection, ShellOpening } from './types';

// What one host holds while it stands: each living shell with what is attached
// to it, the cell a principal's shell is addressed through, and what every
// part of the host reads. The files beside this one do the work.

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
  // set when the session ends (sign-out, reset, eviction) — pending flush
  // passes must not render a disposed shell
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
};
