import type { RenderNode } from '@niscorp/nova';
import type { DeltaOp } from './delta';

// The envelope: every message either end sends is JSON, and one of these.

export type ServerMessage =
  | { type: 'hello'; protocol: number; principal: string | null; catalog: { actions: readonly string[]; hash: string } }
  | { type: 'catalog'; actions: readonly string[]; hash: string }
  // the shell's canvas ARRANGEMENT — a rendered layout whose CanvasSlot
  // markers the terminal resolves against its per-canvas trees
  | { type: 'frame'; tree: RenderNode[] }
  | { type: 'render'; canvas: string; tree: RenderNode[] }
  // The same render, as a DELTA against the last frame this connection was
  // sent for this canvas. Only ever sent to a terminal that asked for deltas
  // (`?delta=1` on the upgrade) and only when a previous frame exists, so a
  // terminal that does not understand this never receives one.
  //
  // `hash` is over the rebuilt message text: a terminal that applies the ops
  // and does not land on it has diverged, and asks for a whole frame instead
  // of rendering something the server never meant.
  | { type: 'render-delta'; canvas: string; ops: DeltaOp[]; hash: number }
  // session GRANT (login succeeded server-side): store the token and
  // reconnect authenticated — the twin of the 4403 SIGNED_OUT revoke
  // A sign-in: the terminal comes back as that principal. As the token, for a
  // terminal that keeps its own; SEALED, for one whose browser keeps the
  // session — it offers it on its next upgrade, where its browser's seal opens it.
  | { type: 'session'; token: string }
  | { type: 'session'; sealed: string }
  | { type: 'error'; code: string; message: string; canvas?: string };

export type ClientMessage =
  | { type: 'event'; canvas: string; event: Record<string, unknown> }
  | { type: 'publish'; channel: string; payload?: unknown }
  // RESYNC: this terminal's frame for a canvas is not what the server thinks
  // it is — a delta failed its checksum, or arrived with no base to apply it
  // to. Answered with whole frames, which is the state both ends can always
  // agree on. Distinct from `reset`: the SHELL is fine, only this connection's
  // copy of it drifted, so nothing is torn down.
  | { type: 'resync' }
  // BACK: undo this session's last navigation. It names no canvas for the same
  // reason `reset` does not — back is one gesture over the whole shell, and the
  // terminal that sends it has no idea which canvas moved last (it is served
  // trees, not stacks). Protocol-level, so a browser's back button, a TUI's
  // Escape and a REPL word are the same message on one wire, and the app has to
  // author nothing to receive it.
  | { type: 'back' }
  // POP TO: jump straight to an ancestor already on a canvas's stack. Back
  // undoes ONE navigation; a breadcrumb that names a screen three levels down
  // is one intention, not three gestures. Sending three `back`s instead raced
  // the browser's own history repair and dropped presses — the shell can walk
  // its own stack atomically, so it should be asked to.
  | { type: 'popTo'; canvas: string; instance: string }
  // RESET: throw this session's shell away and serve its replacement. The one
  // message that names no canvas, deliberately — it is the recovery for a
  // shell whose canvases are the broken thing, so it must not have to travel
  // through one. Protocol-level, not app-level: no action declares it, no
  // charter grants it, and it reaches a terminal whose every surface is dead.
  | { type: 'reset' };
