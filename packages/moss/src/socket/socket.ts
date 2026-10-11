import { z } from 'zod';
import { DefinitionValidationError } from '@niscorp/nova';
import { sealSession } from '../identity';
import { CLOSE_AT_CAPACITY, CLOSE_INVALID_TOKEN, CLOSE_PROTOCOL_MISMATCH, CLOSE_SHELL_FAILED, PROTOCOL } from '../protocol';
import type { ServerMessage } from '../protocol';
import { emitterOf, spanClock } from '../runtime';
import type { Emit, TelemetrySpan } from '../runtime';
import type { ShellSession } from '../shells';
import type { SocketConfig } from './config';
import type { Connection, SocketAccept } from './connection';
import { endingOf } from './ending';
import type { Ending } from './ending';
import { parametersOf, protocolRefusal, whoIsAsking } from './handshake';
import type { SaidOnce, UpgradeParameters } from './handshake';
import { DEFAULT_ANONYMOUS_SHELL_MAX, createAnonymousShellLimit } from './anonymous-shell-limit';
import { createRevalidation } from './revalidation';
import { messageHandler } from './routing';

// The definitions a build refused, by id. Nova's error carries them in its
// context, which is typed as any record: read here, where it is used.
const FailuresSchema = z.object({ failures: z.array(z.object({ id: z.string() })) });
const failedDefinitions = (error: DefinitionValidationError): string[] => {
  const read = FailuresSchema.safeParse(error.context);
  return read.success ? read.data.failures.map((failure) => failure.id) : [];
};

// What a terminal whose session could not be opened reads. The error is the
// server's — it can name a host, a table, a user — and whoever is on this
// connection has not been shown to be anybody. So it is logged where it is
// caught and none of its text is sent. Definitions that failed validation are
// the exception, by id: the app's own artifacts, and what a developer in the
// middle of an edit is looking for.
const refusalOf = (error: unknown): ServerMessage => {
  const failures = error instanceof DefinitionValidationError ? failedDefinitions(error) : [];
  const refusal =
    error instanceof DefinitionValidationError && failures.length > 0
      ? `This session could not be opened — ${error.message}: ${failures.join(', ')}.`
      : "This session could not be opened. Why is in the server's log, not here.";
  return { type: 'error', code: 'session_failed', message: `${refusal} The refusal is this terminal's alone; the server is up.` };
};

// THE SPANS OF ONE CONNECTION, on one clock stamped at the handshake: it
// serves both the short `socket.upgrade` span and the whole-connection
// `socket.close` span from the same origin. Undefined with no sink: then no
// span is built.
type Span = (name: 'socket.upgrade' | 'socket.close', status: TelemetrySpan['status'], hasPrincipal: boolean) => void;
const spanOf = (emit: Emit | undefined): Span | undefined => {
  if (emit === undefined) return undefined;
  const clock = spanClock();
  return (name, status, hasPrincipal) => emit({ name, startUnixNano: clock.startUnixNano, endUnixNano: clock.endUnixNano(), status, attributes: { hasPrincipal } });
};

// WHERE THE SESSION A CONNECTION IS ATTACHED TO COMES FROM: the host its
// address leads to, asked with what the address says of the shell to open.
// Undefined: the app serves no shell.
type Opening = (token: string | null, principal: string | null) => Promise<ShellSession>;
const openingOf = (config: Pick<SocketConfig, 'shells' | 'page'>, { seed, path }: UpgradeParameters): Opening | undefined => {
  // An anonymous terminal whose page was rendered server-side names the id
  // seed that page's shell was built under, so this connection's throwaway
  // shell mints the same instance ids and its first frames match the page.
  // Held to its shape where the address is read (./handshake.ts), never
  // trusted further: it only ever names ids inside the caller's own shell.

  // The path the terminal is on decides which shell it is served: a page's,
  // built for this connection alone, or the app's.
  const route = path === undefined ? undefined : config.page?.(path);
  const host = route?.host ?? config.shells;
  if (host === undefined) return undefined;

  return (token, principal) => host.session(token, principal, { ...(seed === undefined ? {} : { seed }), ...(route === undefined ? {} : { inputs: route.inputs }) });
};

// What a connection for nobody is told when there is no place left for it.
const AT_CAPACITY: ServerMessage = { type: 'error', code: 'at_capacity', message: 'This server is serving as many terminals with nobody signed in as it is set to. Try again in a moment.' };

export const createSocket = (config: SocketConfig): SocketAccept => {
  const emit = emitterOf(config.telemetry);
  const notOwn: SaidOnce = { said: false };
  const revalidation = createRevalidation(config);
  const anonymousShells = createAnonymousShellLimit(config.anonymousShellMax ?? DEFAULT_ANONYMOUS_SHELL_MAX);

  // WHAT AN ADMITTED CONNECTION IS SERVED: `hello`, then the session it is
  // attached to (undefined when the app serves no shell). Both are awaited,
  // and the terminal may be gone by the time either lands: A CONNECTION THAT
  // CLOSED BEFORE ITS SESSION WAS READY LEAVES NOTHING ATTACHED.
  const served = async (
    connection: Connection,
    send: (message: ServerMessage) => void,
    ending: Ending,
    opening: { session: Opening | undefined; delta: boolean },
    who: { token: string | null; principal: string | null },
  ): Promise<ShellSession | undefined> => {
    // The catalog channel: the application, resolved for YOU, on every
    // (re)connect — reconnect re-sends current state, no replay machinery.
    const { ids, hash } = await config.catalog(who.principal);
    // Closed while that was asked: there is nobody to say hello to, and no
    // host is asked for a shell.
    if (ending.ended()) return undefined;
    send({ type: 'hello', protocol: PROTOCOL, principal: who.principal, catalog: { actions: ids, hash } });

    // The canvas streams: attach to the session's shell (durable per
    // principal — the shell outlives this connection) and it re-sends the
    // current trees; every change fans out to every attached connection.
    const session = await opening.session?.(who.token, who.principal);
    if (session === undefined) return undefined;
    // Closed while its shell was built: it is not attached, and the session is
    // told at once that this connection is done with it — which lets a kept
    // shell idle and disposes one built for this connection alone.
    if (!ending.ended()) session.attach(connection, { delta: opening.delta });
    ending.then(() => session.detach(connection));
    return session;
  };

  // REFUSING ONE SESSION MUST NEVER COST THE OTHERS. Every await in the body
  // below can throw — the verifier on a database blip, the shell build on a
  // definition that fails validation — and the runtime transport calls accept
  // without awaiting it, so an escaped rejection is an unhandled one and Node
  // kills the whole process: one bad definition, every session on the box
  // disconnected. So accept NEVER rejects. A failure to open this session is
  // answered to this terminal — a sentence naming the failing definitions
  // when there are any, then a 4500 close — and logged where somebody can
  // read it. The durable map is only written after a successful build, so a
  // refused terminal poisons nothing: the next connect builds fresh.
  const accept = async (url: string, connection: Connection): Promise<void> => {
    const send = (message: ServerMessage): void => connection.send(JSON.stringify(message));
    const span = spanOf(emit);
    // Who the handshake found, once it has: what a span of a session that
    // then failed to open says of it.
    const found = { principal: false };
    try {
      await open(url, connection, send, span, found);
    } catch (error) {
      console.error('[moss/socket] refused a session:', error);
      // A fault, and counted as one. It used to leave no span at all: with the
      // verifier down, upgrades did not turn into errors, they went missing.
      span?.('socket.upgrade', 'error', found.principal);
      revalidation.release(connection);
      anonymousShells.release(connection);
      try {
        send(refusalOf(error));
        connection.close(CLOSE_SHELL_FAILED, 'session failed');
      } catch {
        // The transport is already gone — there is nobody left to tell.
      }
    }
  };

  const open = async (url: string, connection: Connection, send: (message: ServerMessage) => void, span: Span | undefined, found: { principal: boolean }): Promise<void> => {
    const params = parametersOf(url);
    const mismatch = protocolRefusal(params);
    if (mismatch !== undefined) {
      send(mismatch);
      connection.close(CLOSE_PROTOCOL_MISMATCH, 'protocol mismatch');
      return;
    }
    const asking = await whoIsAsking(url, connection.upgrade, config, notOwn);
    if (asking === 'invalid_token') {
      span?.('socket.upgrade', 'refused', false);
      send({ type: 'error', code: 'invalid_token', message: 'The session token did not resolve to a principal.' });
      connection.close(CLOSE_INVALID_TOKEN, 'invalid token');
      return;
    }
    const { token, principal, seal } = asking;
    found.principal = principal !== null;
    if (asking.cookies.length > 0) connection.upgrade?.answer?.(asking.cookies);
    if (seal !== null) connection.seal = (granted) => sealSession(seal, granted);
    // The terminal is told, and stops asking to be handed sign-ins sealed —
    // the next one reaches it as a token, on this connection already.
    if (asking.sealLost) {
      send({ type: 'error', code: 'seal_not_kept', message: 'This browser did not keep the cookie a sealed sign-in is opened with. Sign in again: it will be handed over as a token.' });
    }

    // A SHELL FOR NOBODY TAKES A PLACE (./anonymous-shell-limit.ts), before anything is asked
    // for it: arrivals in one moment each find the count the one before left.
    // With none left the terminal is told so and closed, and no shell is built.
    const session = openingOf(config, params);
    if (principal === null && session !== undefined && !anonymousShells.acquire(connection)) {
      span?.('socket.upgrade', 'refused', false);
      send(AT_CAPACITY);
      connection.close(CLOSE_AT_CAPACITY, 'at capacity');
      return;
    }

    revalidation.hold(connection, token !== null && token !== '' && principal !== null ? { token, principal } : null);
    // Listened for here, before anything below awaits (./ending.ts).
    const ending = endingOf(connection);
    ending.then(() => revalidation.release(connection));
    ending.then(() => anonymousShells.release(connection));
    // The connection's whole life, closed by the same clock — how long
    // terminals stay, and under a principal or anonymous. Registered here so it
    // fires however the connection ends (graceful, expiry, transport drop).
    if (span !== undefined) ending.then(() => span('socket.close', 'ok', principal !== null));

    // Frame deltas are OPT-IN by the terminal, on the upgrade URL — the
    // capability has to be known before the first frame is sent. A terminal
    // that says nothing is served whole frames forever, which is what every
    // terminal built before this existed does.
    const attached = await served(connection, send, ending, { session, delta: params.delta === '1' }, { token, principal });

    // Admitted: the handshake resolved a principal, said hello, and attached a
    // shell. The span measures that, not the connection's life (that is
    // `socket.close`).
    span?.('socket.upgrade', 'ok', principal !== null);

    connection.onMessage(messageHandler(attached, connection, send));
  };

  return Object.assign(accept, { stop: revalidation.stop });
};
