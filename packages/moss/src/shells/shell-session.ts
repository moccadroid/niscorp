import { NovaEventSchema } from '@niscorp/nova';
import type { Shell } from '@niscorp/nova';
import type { Cell, HostParts } from './live';
import { attach, resync } from './stream';
import type { ShellSession } from './types';

// WHAT A TRANSPORT HOLDS OF ONE SESSION: what a socket attaches its connection
// to and routes a terminal's messages into. It addresses the shell through its
// cell, so a reset reaches whoever holds it.
//
// `ephemeral`: the shell is nobody's to keep, and goes when its last
// connection does. `rebuild`: how the host replaces the shell in a cell.
export const sessionOn = (host: HostParts, cell: Cell, ephemeral: boolean, rebuild: (cell: Cell) => Promise<void>): ShellSession => ({
  // Read through the cell, always: after a reset the shell behind this
  // session is a different object.
  get shell(): Shell {
    return cell.live.shell;
  },
  attach: (connection, options) => attach(cell.live, connection, host.delta && options?.delta === true),
  resync: (connection) => resync(cell.live, connection),
  detach: (connection) => {
    const live = cell.live;
    live.connections.delete(connection);
    live.deltaReady.delete(connection);
    if (live.connections.size > 0) return;
    live.idleSince = Date.now();
    if (!ephemeral) return;
    live.ended = true;
    live.shell.dispose();
  },
  // Transport → shell addressing: the wire tags the canvas, and nova's own
  // origin filter delivers the event to one instance's triggers alone.
  //
  // A terminal NAMES the instance when it knows it — a list canvas renders
  // several live cards, and the ActionSlot around the press says which. That
  // claim comes off the wire, so it is held to the canvas the event is
  // tagged with: an instance that is not on it (gone since the render, or on
  // another canvas altogether) drops the event — firing it anywhere else
  // would run triggers the person never pressed. With no claim, the canvas's
  // ACTIVE instance is the origin: on a card deck that is the only one
  // rendered. A canvas with nothing mounted dispatches unstamped (global).
  dispatch: (canvas, event) => {
    const { shell } = cell.live;
    const state = shell.getState().canvases[canvas];
    const claimed = event['origin'];
    if (claimed !== undefined && (typeof claimed !== 'string' || !(state?.stack ?? []).some((item) => item.id === claimed))) return;
    const active = state?.active;
    // WHAT AN EVENT IS belongs to nova, and nova's shell takes one of its
    // events and nothing else. What arrived here is whatever object a
    // terminal sent (the protocol holds it to being an object), so it is
    // read by nova's schema where it enters the shell. One that does not
    // parse is dropped, as an event naming an instance that is not there is:
    // there is nothing it could have been a press on.
    const read = NovaEventSchema.safeParse(claimed !== undefined || active === undefined ? event : { ...event, origin: active.id });
    if (read.success) shell.dispatch(read.data);
  },
  publish: (channel, payload) => cell.live.shell.publish(channel, payload),
  back: () => cell.live.shell.back(),
  popTo: (canvas: string, instance: string) => cell.live.shell.popTo(canvas, instance),
  reset: () => void rebuild(cell).catch((err: unknown) => console.error('[moss/shells] a reset failed to rebuild', err)),
});
