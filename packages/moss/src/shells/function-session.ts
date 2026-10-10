import type { FetchFn, FunctionHandler, Shell } from '@niscorp/nova';
import { revokeAllFor } from '../identity';
import type { FunctionSession } from '../manifest';
import { CLOSE_SIGNED_OUT } from '../protocol';
import type { ServerMessage } from '../protocol';
import { spanClock } from '../runtime';
import type { Emit } from '../runtime';
import type { HostParts, Live } from './live';
import type { ShellPrincipal } from './types';

// THE SESSION APP CODE IS HANDED (`functions`, `onSession`), made for one
// shell: who is calling, the wire as them, and what a session may do by name
// (grant, revoke, answerIntent, recordRun).

// Each in-process function wrapped to emit one `fn.call` span — the fn name,
// principal presence, duration, and whether it threw. The in-process dispatch
// is where server functions run today (`/fns`, the URL layer, is still
// unbuilt); a service written against either is observed the same way. Built
// only when a sink is present (the caller guards), so an unobserved session
// pays nothing per call. The span names the function, never its data.
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

// What a session reads that does not exist yet when it is made: the shell, and
// what is attached to it. The build fills both in once the shell stands.
export type Standing = { shell?: Shell; live?: Live };

// GRANT: the minted token to every terminal of this session — they
// reconnect as the new principal; this (anonymous) session stays
// ephemeral and dies on detach.
const grant = (standing: Standing, token: string): void => {
  const message = JSON.stringify({ type: 'session', token } satisfies ServerMessage);
  for (const connection of standing.live?.connections ?? []) {
    if (connection.seal === undefined) connection.send(message);
    // its browser keeps the session: sealed, so the page that carries it back cannot open it (../socket.ts)
    else {
      void connection.seal(token).then(
        (sealed) => connection.send(JSON.stringify({ type: 'session', sealed } satisfies ServerMessage)),
        (error: unknown) => console.error('[moss] a sign-in could not be sealed, and was not handed over:', error),
      );
    }
  }
};

// REVOKE: forget the credential, close every terminal SIGNED_OUT,
// evict the durable shell. Under moss's own credential the rows go
// first — closing the terminals clears the tokens THEY held, not a
// copy anywhere else. The shell is the principal's and every one of
// its terminals closes, so every session the principal holds is
// deleted, not only the one this shell was built with. A custom
// verifier's credential is the app's to revoke; 'dev-open' stores
// none. The teardown is deferred a microtask so the calling trigger
// finishes before its own shell is disposed.
const revoke = (host: HostParts, standing: Standing, principal: string | null): Promise<void> => {
  const { ctx, durable } = host;
  const forgotten = ctx.runtime.session === 'sessions' && principal !== null ? revokeAllFor(ctx.runtime.pool, principal) : Promise.resolve();
  // Loud when it fails — a sign-out that left the credential alive is
  // a security fault, not a detail — and never an unhandled rejection
  // for a caller that did not await it. A caller that does still sees
  // the failure.
  forgotten.catch((error: unknown) => console.error(`[moss] sign-out of ${principal ?? 'anonymous'} did not revoke its sessions:`, error));
  queueMicrotask(() => {
    const live = standing.live;
    if (live === undefined) return;
    live.ended = true;
    // Only if the map still holds THIS shell — a reset between the
    // sign-out and this microtask has already replaced it, and the
    // replacement belongs to whoever caused it.
    if (principal !== null && durable.get(principal)?.live === live) durable.delete(principal);
    for (const connection of [...live.connections]) connection.close(CLOSE_SIGNED_OUT, 'signed out');
    live.connections.clear();
    if (principal !== null) live.shell.dispose();
  });
  return forgotten;
};

// The manifest's in-process functions close over this, made for THIS
// session — the shell and the live connection set land in `standing` just
// after creation (a function that somehow runs before then fails loudly).
export const functionSessionFor = (
  host: HostParts,
  made: { principal: string | null; who: ShellPrincipal; wire: FetchFn; standing: Standing },
): FunctionSession => {
  const { ctx } = host;
  const { principal, who, wire, standing } = made;
  const session: FunctionSession = {
    principal,
    roles: who.roles,
    identity: who.scope,
    actions: who.catalog.ids,
    wire,
    get shell(): Shell {
      if (standing.shell === undefined) throw new Error('moss: a function touched the shell before the session finished building.');
      return standing.shell;
    },
    grant: (token) => grant(standing, token),
    revoke: () => revoke(host, standing, principal),
    answerIntent: (writers, asked) =>
      ctx.answerIntent === undefined
        ? Promise.reject(new Error('moss: this shell host was given no way to answer an intent.'))
        : ctx.answerIntent(principal, writers, asked),
    // The session's own fields are stamped here so a caller cannot get them
    // wrong, and the shell id is read lazily — a run cannot happen before
    // the shell exists, but this object is built before it does.
    recordRun: (run) => {
      if (ctx.app.runs === undefined) return;
      ctx.app.runs({ ...run, at: Date.now(), principal, shellId: standing.shell?.id ?? '' }, session);
    },
  };
  return session;
};
