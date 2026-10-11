import { z } from 'zod';
import { DefinitionValidationError } from '@niscorp/nova';
import { sealSession } from '../identity';
import { CLOSE_AT_CAPACITY, CLOSE_INVALID_TOKEN, CLOSE_PROTOCOL_MISMATCH, CLOSE_SHELL_FAILED, PROTOCOL } from '../protocol';
import type { ServerMessage } from '../protocol';
import { emitterOf, spanClock } from '../runtime';
import type { Emit, TelemetrySpan } from '../runtime';
import type { ShellSession } from '../shells';
import type { Connection, SocketAccept, SocketConfig } from './types';
import { authenticateUpgrade, parametersOf, protocolRefusal } from './handshake';
import type { UpgradeParameters, WarnedOnce } from './handshake';
import { createRevalidation } from './revalidation';
import type { Revalidation } from './revalidation';
import { messageHandler } from './routing';

// WHEN A CONNECTION ENDS, heard once and kept.
//
// A transport tells a close to whoever is listening when it happens (on Node,
// `ws` emits it), and to nobody who starts listening afterwards. Opening a
// session awaits: what somebody holds is asked, their shell is built. A
// listener registered after one of those, on a connection that closed
// meanwhile, would never be called — the connection would stay attached to its
// shell for ever. A kept shell would never idle; a throwaway one would never
// be disposed.
//
// So the close is listened for once, before the first of those awaits, and
// remembered. What has to be undone when the connection ends is said here as
// each thing is done: it runs when the close arrives, or at once if it has.
type ConnectionClose = {
  ended: () => boolean;
  then: (undo: () => void) => void;
};

const closeOf = (connection: Connection): ConnectionClose => {
  let ended = false;
  const undoing: (() => void)[] = [];
  connection.onClose(() => {
    ended = true;
    for (const undo of undoing.splice(0)) undo();
  });
  return {
    ended: () => ended,
    then: (undo) => {
      if (ended) undo();
      else undoing.push(undo);
    },
  };
};

// THE SHELLS FOR NOBODY ALIVE AT ONCE, and their limit.
//
// Somebody signed in has one shell, however many terminals they open. Nobody
// signed in has a shell for each connection, built for it and disposed with
// it — and a connection costs whoever opens it nothing: no account, no token.
// Unlimited, the memory of the process would be anybody's to fill. So each
// connection for nobody that is served a shell takes a place here, and gives
// it back when it ends. One over the limit is told so and closed
// (`CLOSE_AT_CAPACITY`, ../protocol), and no shell is built for it.
//
// A shell a page builds for somebody SIGNED IN is one for each connection too,
// and takes no place: it takes a credential to open one.
//
// WHAT THE LIMIT IS: ONE COUNT, FOR EVERYBODY WITH NOBODY SIGNED IN, IN ONE
// PROCESS. It bounds what this process holds in memory for them, and that is
// all it does. It is not a limit for each visitor: whoever holds the places
// holds them, so one client that opens as many connections as the limit and
// keeps them has every place, and every other visitor with nobody signed in
// is told `at_capacity` until one of those closes. A process counts its own
// connections: N processes hold N times the limit between them.
//
// WHY NOT ONE FOR EACH ADDRESS. The address a connection comes from is not
// moss's to know: behind a proxy every connection comes from the proxy, and
// which header carries the visitor's is the proxy's to say. A deployment that
// faces the internet limits how many connections one address may hold where
// the address is known, at its proxy or load balancer, on the socket's path;
// this limit is then what keeps the process inside its memory, and is sized
// to that.

// THE DEFAULT is the largest round number at which the terminals of nobody, at
// their limit, still fit a process given 512 MB. The per-shell figures it comes
// from are in DOCS.md (`NiscRuntime`, `anonymousShellMax`). A deployment that
// expects more of them at once says so (`runtime.anonymousShellMax`), from
// those numbers and its own memory.
export const DEFAULT_ANONYMOUS_SHELL_MAX = 1000;

type AnonymousShellLimit = {
  // Take a place for a connection. False: there is none left.
  acquire: (connection: Connection) => boolean;
  // Give it back: the connection ended, or its shell could not be built.
  release: (connection: Connection) => void;
};

const createAnonymousShellLimit = (max: number): AnonymousShellLimit => {
  // The connections, and not a count of them: giving a place back twice (a
  // refusal, then the close it causes) is then giving it back once.
  const taken = new Set<Connection>();
  return {
    acquire: (connection) => {
      if (taken.size >= max) return false;
      taken.add(connection);
      return true;
    },
    release: (connection) => {
      taken.delete(connection);
    },
  };
};

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

// WHAT AN ADMITTED CONNECTION IS SERVED: `hello`, then the session it is
// attached to (undefined when the app serves no shell). Both are awaited,
// and the terminal may be gone by the time either lands: A CONNECTION THAT
// CLOSED BEFORE ITS SESSION WAS READY LEAVES NOTHING ATTACHED.
const served = async (
  config: Pick<SocketConfig, 'catalog'>,
  connection: Connection,
  send: (message: ServerMessage) => void,
  close: ConnectionClose,
  opening: { session: Opening | undefined; delta: boolean },
  who: { token: string | null; principal: string | null },
): Promise<ShellSession | undefined> => {
  // The catalog channel: the application, resolved for YOU, on every
  // (re)connect — reconnect re-sends current state, no replay machinery.
  const { ids, hash } = await config.catalog(who.principal);
  // Closed while that was asked: there is nobody to say hello to, and no
  // host is asked for a shell.
  if (close.ended()) return undefined;
  send({ type: 'hello', protocol: PROTOCOL, principal: who.principal, catalog: { actions: ids, hash } });

  // The canvas streams: attach to the session's shell (durable per
  // principal — the shell outlives this connection) and it re-sends the
  // current trees; every change fans out to every attached connection.
  const session = await opening.session?.(who.token, who.principal);
  if (session === undefined) return undefined;
  // Closed while its shell was built: it is not attached, and the session is
  // told at once that this connection is done with it — which lets a kept
  // shell idle and disposes one built for this connection alone.
  if (!close.ended()) session.attach(connection, { delta: opening.delta });
  close.then(() => session.detach(connection));
  return session;
};

// WHAT A SOCKET HOLDS ACROSS ITS CONNECTIONS: what it was made with, and the
// three things that are counted or said once for all of them.
type Held = { config: SocketConfig; notOwn: WarnedOnce; revalidation: Revalidation; anonymousShells: AnonymousShellLimit };

// ONE CONNECTION, FROM ITS ADDRESS TO ITS FIRST MESSAGE: the protocol it
// speaks, who is asking, a place for a shell for nobody, what it is served,
// and where its messages go from then on. It throws when the session cannot
// be opened; `accept` (below) is what answers that.
const open = async (held: Held, url: string, connection: Connection, send: (message: ServerMessage) => void, span: Span | undefined, found: { principal: boolean }): Promise<void> => {
  const { config, notOwn, revalidation, anonymousShells } = held;
  const params = parametersOf(url);
  const mismatch = protocolRefusal(params);
  if (mismatch !== undefined) {
    send(mismatch);
    connection.close(CLOSE_PROTOCOL_MISMATCH, 'protocol mismatch');
    return;
  }
  const asking = await authenticateUpgrade(url, connection.upgrade, config, notOwn);
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

  // A SHELL FOR NOBODY TAKES A PLACE (`createAnonymousShellLimit`, above),
  // before anything is asked for it: arrivals in one moment each find the
  // count the one before left.
  // With none left the terminal is told so and closed, and no shell is built.
  const session = openingOf(config, params);
  if (principal === null && session !== undefined && !anonymousShells.acquire(connection)) {
    span?.('socket.upgrade', 'refused', false);
    send(AT_CAPACITY);
    connection.close(CLOSE_AT_CAPACITY, 'at capacity');
    return;
  }

  revalidation.hold(connection, token !== null && token !== '' && principal !== null ? { token, principal } : null);
  // Listened for here, before anything below awaits (`closeOf`, above).
  const close = closeOf(connection);
  close.then(() => revalidation.release(connection));
  close.then(() => anonymousShells.release(connection));
  // The connection's whole life, closed by the same clock — how long
  // terminals stay, and under a principal or anonymous. Registered here so it
  // fires however the connection ends (graceful, expiry, transport drop).
  if (span !== undefined) close.then(() => span('socket.close', 'ok', principal !== null));

  // Frame deltas are OPT-IN by the terminal, on the upgrade URL — the
  // capability has to be known before the first frame is sent. A terminal
  // that says nothing is served whole frames.
  const attached = await served(config, connection, send, close, { session, delta: params.delta === '1' }, { token, principal });

  // Admitted: the handshake resolved a principal, said hello, and attached a
  // shell. The span measures that, not the connection's life (that is
  // `socket.close`).
  span?.('socket.upgrade', 'ok', principal !== null);

  connection.onMessage(messageHandler(attached, connection, send));
};

export const createSocket = (config: SocketConfig): SocketAccept => {
  const emit = emitterOf(config.telemetry);
  const revalidation = createRevalidation(config);
  const anonymousShells = createAnonymousShellLimit(config.anonymousShellMax ?? DEFAULT_ANONYMOUS_SHELL_MAX);
  const held: Held = { config, notOwn: { warned: false }, revalidation, anonymousShells };

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
      await open(held, url, connection, send, span, found);
    } catch (error) {
      console.error('[moss/socket] refused a session:', error);
      // A fault, and counted as one: with the verifier down, upgrades show as
      // errors and not as upgrades that went missing.
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

  return Object.assign(accept, { stop: revalidation.stop });
};
