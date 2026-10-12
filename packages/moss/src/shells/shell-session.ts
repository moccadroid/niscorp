import { NovaEventSchema } from '@niscorp/nova';
import type { Shell } from '@niscorp/nova';
import { endShell } from './host-state';
import type { Cell, HostState } from './host-state';
import { attach, resync } from './stream';
import type { ShellSession } from './types';

export const sessionOn = (host: HostState, cell: Cell, ephemeral: boolean, reset: (cell: Cell) => void): ShellSession => ({
  get shell(): Shell {
    return cell.live.sessionShell;
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
    endShell(host, live);
    live.shell.dispose();
  },
  // An event without an origin goes to every instance of the shell, so one for
  // a canvas the shell does not have is dropped. An origin a terminal names
  // comes off the wire and is held to that canvas; with none named, the
  // canvas's active instance is the origin.
  dispatch: (canvas, event) => {
    const { shell } = cell.live;
    const state = shell.getState().canvases[canvas];
    if (state === undefined) return;
    const claimed = event['origin'];
    if (claimed !== undefined && (typeof claimed !== 'string' || !state.stack.some((item) => item.id === claimed))) return;
    const active = state.active;
    const read = NovaEventSchema.safeParse(claimed !== undefined || active === undefined ? event : { ...event, origin: active.id });
    if (read.success) shell.dispatch(read.data);
  },
  publish: (channel, payload) => cell.live.shell.publish(channel, payload),
  back: () => cell.live.shell.back(),
  popTo: (canvas: string, instance: string) => cell.live.shell.popTo(canvas, instance),
  reset: () => reset(cell),
});
