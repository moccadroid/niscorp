import { NovaEventSchema } from '@niscorp/nova';
import type { FetchFn, FunctionHandler, Shell } from '@niscorp/nova';
import type { FunctionSession } from '../manifest';
import { CLOSE_SIGNED_OUT } from '../protocol';
import type { ServerMessage } from '../protocol';
import { spanClock } from '../runtime';
import type { Emit } from '../runtime';
import { sessionDraftOn } from './draft';
import { endShell } from './host-state';
import type { Cell, HostState, Live } from './host-state';
import { attach, resync } from './stream';
import type { ShellSession } from './types';

export const instrumentFunctions = (
  fns: Record<string, FunctionHandler>,
  emit: Emit,
  principal: string | null,
): Record<string, FunctionHandler> =>
  Object.fromEntries(
    Object.entries(fns).map(([name, handler]): [string, FunctionHandler] => [
      name,
      async (data, signal) => {
        const clock = spanClock();
        const hasPrincipal = principal !== null;
        try {
          const out = await handler(data, signal);
          emit({ name: 'fn.call', startUnixNano: clock.startUnixNano, endUnixNano: clock.endUnixNano(), status: 'ok', attributes: { fn: name, hasPrincipal } });
          return out;
        } catch (err) {
          emit({ name: 'fn.call', startUnixNano: clock.startUnixNano, endUnixNano: clock.endUnixNano(), status: 'error', attributes: { fn: name, hasPrincipal } });
          throw err;
        }
      },
    ]),
  );

export type ShellRef = { shell?: Shell; sessionShell?: Shell; live?: Live };

const grant = (shellRef: ShellRef, token: string): void => {
  const message = JSON.stringify({ type: 'session', token } satisfies ServerMessage);
  for (const connection of shellRef.live?.connections ?? []) {
    if (connection.seal === undefined) connection.send(message);
    else {
      void connection.seal(token).then(
        (sealed) => connection.send(JSON.stringify({ type: 'session', sealed } satisfies ServerMessage)),
        (error: unknown) => console.error('[moss] a sign-in could not be sealed, and was not handed over:', error),
      );
    }
  }
};

// The teardown waits a microtask, so the trigger that called this finishes
// before its own shell is disposed.
const revoke = (host: HostState, shellRef: ShellRef, principal: string | null): Promise<void> => {
  const { config, durable } = host;
  const forgotten = config.revokeSessions !== undefined && principal !== null ? config.revokeSessions(principal) : Promise.resolve();
  // Logged here, so a caller that does not await leaves no unhandled rejection;
  // one that does still sees the failure.
  forgotten.catch((error: unknown) => console.error(`[moss] sign-out of ${principal ?? 'anonymous'} did not revoke its sessions:`, error));
  queueMicrotask(() => {
    const live = shellRef.live;
    if (live === undefined) return;
    endShell(host, live);
    // Only while the map still holds this shell: a reset since the sign-out
    // has put another in its cell.
    if (principal !== null && durable.get(principal)?.live === live) durable.delete(principal);
    for (const connection of [...live.connections]) connection.close(CLOSE_SIGNED_OUT, 'signed out');
    live.connections.clear();
    if (principal !== null) live.shell.dispose();
  });
  return forgotten;
};

export const functionSessionFor = (
  host: HostState,
  who: { principal: string | null; roles: readonly string[]; scope: Record<string, unknown>; actions: readonly string[] },
  wire: FetchFn,
  shellRef: ShellRef,
): FunctionSession => {
  const { config } = host;
  const { principal } = who;
  const artifacts = config.artifacts?.(principal);
  const session: FunctionSession = {
    get artifacts() {
      if (artifacts === undefined) throw new Error('moss: this shell host was given nothing to save with.');
      return artifacts;
    },
    draft: sessionDraftOn({ saving: config.draftSaving?.(principal), liveOf: () => shellRef.live, adopt: host.adoptDraft }),
    principal,
    roles: who.roles,
    identity: who.scope,
    actions: who.actions,
    wire,
    get shell(): Shell {
      if (shellRef.sessionShell === undefined) throw new Error('moss: a function touched the shell before the session finished building.');
      return shellRef.sessionShell;
    },
    grant: (token) => grant(shellRef, token),
    revoke: () => revoke(host, shellRef, principal),
    answerIntent: (writers, asked) =>
      config.answerIntent === undefined
        ? Promise.reject(new Error('moss: this shell host was given no way to answer an intent.'))
        : config.answerIntent(principal, writers, asked),
    recordRun: (run) => {
      config.hooks.runs?.({ ...run, at: Date.now(), principal, shellId: shellRef.shell?.id ?? '' }, session);
    },
    functions: () => Object.keys(shellRef.live?.functions.held ?? {}),
  };
  return session;
};

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
    const parsed = NovaEventSchema.safeParse(claimed !== undefined || active === undefined ? event : { ...event, origin: active.id });
    if (parsed.success) shell.dispatch(parsed.data);
  },
  publish: (channel, payload) => cell.live.shell.publish(channel, payload),
  back: () => cell.live.shell.back(),
  popTo: (canvas: string, instance: string) => cell.live.shell.popTo(canvas, instance),
  reset: () => reset(cell),
});
