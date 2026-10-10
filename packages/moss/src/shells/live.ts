import type { ActionDefinition, Shell } from '@niscorp/nova';
import type { ShellManifest } from '../manifest';
import type { Emit } from '../runtime';
import type { ShellConnection, ShellHostContext } from './types';

// What one host holds while it stands: each living shell with what is attached
// to it, the cell a principal's shell is addressed through, and what every
// part of the host reads. Types only; the files beside this one do the work.

export type Live = {
  shell: Shell;
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

// The indirection `reset` needs. A session, a socket and the durable map all
// address a principal's shell through ONE mutable cell, so replacing the
// shell reaches every holder at once and nobody is left pointing at a
// disposed one. The token is kept beside it because a rebuild has to
// re-authorize the server's own wire as the same session, and it is
// refreshed on reattach so a rebuild uses the newest one the principal
// arrived with rather than the one they first appeared with.
export type Cell = { live: Live; token: string | null; principal: string | null; roles: readonly string[]; installed: readonly string[] | undefined; hash: string };

// WHAT EVERY PART OF ONE HOST READS, settled once when the host is created:
// what it was handed, and what it worked out from that.
export type HostParts = {
  ctx: ShellHostContext;
  // Where a span goes. Undefined when the deployment has no sink: then none
  // is built.
  emit: Emit | undefined;
  // The shell this host builds: the app's own, or a page's.
  shellManifest: ShellManifest;
  // Whether a principal's shell is kept (`ShellHostContext.kept`).
  kept: boolean;
  // The actions in force now.
  actionsNow: () => Readonly<Record<string, ActionDefinition>>;
  // Every component name a tree may mention, and the contracts declared.
  componentNames: ReadonlySet<string>;
  contracts: NonNullable<ShellManifest['components']>;
  // Whether a changed canvas may be sent as a delta (`ShellHostContext.delta`).
  delta: boolean;
  // principal → the one living shell
  durable: Map<string, Cell>;
};
