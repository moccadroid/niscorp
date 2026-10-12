import { z } from 'zod';
import { DefinitionValidationError } from '@niscorp/nova';
import { emitterOf, spanClock } from '../runtime';
import type { Emit, Telemetry, TelemetrySpan } from '../runtime';
import type { ShellHost, ShellSession } from '../shells';
import { sealSession } from '../identity';
import { CLOSE_AT_CAPACITY, CLOSE_INVALID_TOKEN, CLOSE_PROTOCOL_MISMATCH, CLOSE_SHELL_FAILED, PROTOCOL } from '../protocol';
import type { ServerMessage } from '../protocol';
import { authenticateUpgrade, parametersOf, protocolRefusal } from './handshake';
import type { UpgradeParameters, WarnedOnce } from './handshake';
import { createRevalidation } from './revalidation';
import type { Revalidation } from './revalidation';
import { messageHandler } from './routing';

export type SessionSource = Pick<ShellHost, 'session'>;

export type HeldCatalog = { ids: readonly string[]; hash: string };

export type SocketConfig = {
  session: (token: string) => string | null | Promise<string | null>;
  catalog: (principal: string | null) => HeldCatalog | Promise<HeldCatalog>;
  shells?: SessionSource;
  page?: (path: string) => { host: SessionSource; inputs: Record<string, Record<string, unknown>> } | undefined;
  anonymousShellMax?: number;
  // `0` or `Infinity` disables it.
  revalidateMs?: number;
  telemetry?: Telemetry;
  origins?: readonly string[];
  sessionLastsMs?: (token: string) => number | null | Promise<number | null>;
};

export type Connection = {
  send: (text: string) => void;
  close: (code?: number, reason?: string) => void;
  onMessage: (fn: (text: string) => void) => void;
  onClose: (fn: () => void) => void;
  // `answer`: given by a transport that has not answered the request yet. It is
  // called once with the `Set-Cookie` values that answer is to carry.
  upgrade?: {
    offered: readonly string[];
    origin?: string | null;
    host?: string | null;
    cookie?: string | null;
    answer?: (cookies: readonly string[]) => void;
  };
  // Set by the socket, never by a transport.
  seal?: (token: string) => Promise<string>;
};

export type TransportSettings = { compression?: boolean | Record<string, unknown>; maxMessageBytes?: number };

export type SocketAccept = ((url: string, connection: Connection) => Promise<void>) & { stop: () => void; transport?: TransportSettings };

// A transport tells a close only to whoever already listens, and opening a
// session awaits. So the close is heard once, before those awaits, and kept:
// an undo registered after it runs at once.
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

export const DEFAULT_ANONYMOUS_SHELL_MAX = 1000;

type AnonymousShellLimit = {
  acquire: (connection: Connection) => boolean;
  release: (connection: Connection) => void;
};

const createAnonymousShellLimit = (max: number): AnonymousShellLimit => {
  // A set, not a count: a place given back twice (a refusal, then the close it
  // causes) is given back once.
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

const FailuresSchema = z.object({ failures: z.array(z.object({ id: z.string() })) });
const failedDefinitions = (error: DefinitionValidationError): string[] => {
  const read = FailuresSchema.safeParse(error.context);
  return read.success ? read.data.failures.map((failure) => failure.id) : [];
};

// The error's text is not sent: it can name a host, a table or a user, and
// this connection is nobody yet. The ids of definitions that failed
// validation are the exception.
const refusalOf = (error: unknown): ServerMessage => {
  const failures = error instanceof DefinitionValidationError ? failedDefinitions(error) : [];
  const refusal =
    error instanceof DefinitionValidationError && failures.length > 0
      ? `This session could not be opened — ${error.message}: ${failures.join(', ')}.`
      : "This session could not be opened. Why is in the server's log, not here.";
  return { type: 'error', code: 'session_failed', message: `${refusal} The refusal is this terminal's alone; the server is up.` };
};

type Span = (name: 'socket.upgrade' | 'socket.close', status: TelemetrySpan['status'], hasPrincipal: boolean) => void;
const spanOf = (emit: Emit | undefined): Span | undefined => {
  if (emit === undefined) return undefined;
  const clock = spanClock();
  return (name, status, hasPrincipal) => emit({ name, startUnixNano: clock.startUnixNano, endUnixNano: clock.endUnixNano(), status, attributes: { hasPrincipal } });
};

type Opening = (token: string | null, principal: string | null) => Promise<ShellSession>;
const openingOf = (config: Pick<SocketConfig, 'shells' | 'page'>, { seed, path }: UpgradeParameters): Opening | undefined => {
  const route = path === undefined ? undefined : config.page?.(path);
  const host = route?.host ?? config.shells;
  if (host === undefined) return undefined;

  return (token, principal) => host.session(token, principal, { ...(seed === undefined ? {} : { seed }), ...(route === undefined ? {} : { inputs: route.inputs }) });
};

const AT_CAPACITY: ServerMessage = { type: 'error', code: 'at_capacity', message: 'This server is serving as many terminals with nobody signed in as it is set to. Try again in a moment.' };

const served = async (
  config: Pick<SocketConfig, 'catalog'>,
  connection: Connection,
  send: (message: ServerMessage) => void,
  close: ConnectionClose,
  opening: { session: Opening | undefined; delta: boolean },
  who: { token: string | null; principal: string | null },
): Promise<ShellSession | undefined> => {
  const { ids, hash } = await config.catalog(who.principal);
  if (close.ended()) return undefined;
  send({ type: 'hello', protocol: PROTOCOL, principal: who.principal, catalog: { actions: ids, hash } });

  const session = await opening.session?.(who.token, who.principal);
  if (session === undefined) return undefined;
  // One that closed while its shell was built is not attached, and is detached
  // all the same: that disposes a shell built for this connection alone.
  if (!close.ended()) session.attach(connection, { delta: opening.delta });
  close.then(() => session.detach(connection));
  return session;
};

type Held = { config: SocketConfig; notOwn: WarnedOnce; revalidation: Revalidation; anonymousShells: AnonymousShellLimit };

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
  if (asking.sealLost) {
    send({ type: 'error', code: 'seal_not_kept', message: 'This browser did not keep the cookie a sealed sign-in is opened with. Sign in again: it will be handed over as a token.' });
  }

  // The place is taken before anything is awaited for the shell: arrivals in
  // one moment each find the count the one before left.
  const session = openingOf(config, params);
  if (principal === null && session !== undefined && !anonymousShells.acquire(connection)) {
    span?.('socket.upgrade', 'refused', false);
    send(AT_CAPACITY);
    connection.close(CLOSE_AT_CAPACITY, 'at capacity');
    return;
  }

  revalidation.hold(connection, token !== null && token !== '' && principal !== null ? { token, principal } : null);
  // Before anything below awaits (`closeOf`).
  const close = closeOf(connection);
  close.then(() => revalidation.release(connection));
  close.then(() => anonymousShells.release(connection));
  if (span !== undefined) close.then(() => span('socket.close', 'ok', principal !== null));

  const attached = await served(config, connection, send, close, { session, delta: params.delta === '1' }, { token, principal });

  span?.('socket.upgrade', 'ok', principal !== null);

  connection.onMessage(messageHandler(attached, connection, send));
};

export const createSocket = (config: SocketConfig): SocketAccept => {
  const emit = emitterOf(config.telemetry);
  const revalidation = createRevalidation(config);
  const anonymousShells = createAnonymousShellLimit(config.anonymousShellMax ?? DEFAULT_ANONYMOUS_SHELL_MAX);
  const held: Held = { config, notOwn: { warned: false }, revalidation, anonymousShells };

  // `accept` never rejects: a transport calls it without awaiting, and an
  // unhandled rejection ends the process for every session on it.
  const accept = async (url: string, connection: Connection): Promise<void> => {
    const send = (message: ServerMessage): void => connection.send(JSON.stringify(message));
    const span = spanOf(emit);
    const found = { principal: false };
    try {
      await open(held, url, connection, send, span, found);
    } catch (error) {
      console.error('[moss/socket] refused a session:', error);
      span?.('socket.upgrade', 'error', found.principal);
      revalidation.release(connection);
      anonymousShells.release(connection);
      try {
        send(refusalOf(error));
        connection.close(CLOSE_SHELL_FAILED, 'session failed');
      } catch {
        // The transport is already gone: nobody is left to tell.
      }
    }
  };

  return Object.assign(accept, { stop: revalidation.stop });
};
