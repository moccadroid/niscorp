import { z } from 'zod';
import { DefinitionValidationError } from '@niscorp/nova';
import { sealSession } from '../identity';
import { CLOSE_INVALID_TOKEN, CLOSE_PROTOCOL_MISMATCH, CLOSE_SHELL_FAILED, PROTOCOL } from '../protocol';
import type { ServerMessage } from '../protocol';
import { emitterOf, spanClock } from '../runtime';
import type { ShellSession } from '../shells';
import type { SocketConfig } from './config';
import type { Connection, SocketAccept } from './connection';
import { parametersOf, protocolRefusal, whoIsAsking } from './handshake';
import type { SaidOnce } from './handshake';
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

// THE SESSION A CONNECTION IS ATTACHED TO, asked of the host its address
// leads to. Undefined: the app serves no shell.
const sessionFor = (config: Pick<SocketConfig, 'shells' | 'page'>, params: URLSearchParams, token: string | null, principal: string | null): Promise<ShellSession> | undefined => {
  // An anonymous terminal whose page was rendered server-side names the id
  // seed that page's shell was built under, so this connection's throwaway
  // shell mints the same instance ids and its first frames match the page.
  // Shape-checked, never trusted further: it only ever names ids inside the
  // caller's own shell.
  const named = params.get('seed');
  const seed = named !== null && /^[0-9a-f]{8,40}$/.test(named) ? named : undefined;

  // The path the terminal is on decides which shell it is served: a page's,
  // built for this connection alone, or the app's.
  const path = params.get('path');
  const route = path === null ? undefined : config.page?.(path);
  const host = route?.host ?? config.shells;

  return host?.session(token, principal, { ...(seed === undefined ? {} : { seed }), ...(route === undefined ? {} : { inputs: route.inputs }) });
};

export const createSocket = (config: SocketConfig): SocketAccept => {
  const emit = emitterOf(config.telemetry);
  const notOwn: SaidOnce = { said: false };
  const revalidation = createRevalidation(config);

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
    try {
      await open(url, connection, send);
    } catch (error) {
      console.error('[moss/socket] refused a session:', error);
      revalidation.release(connection);
      try {
        send(refusalOf(error));
        connection.close(CLOSE_SHELL_FAILED, 'session failed');
      } catch {
        // The transport is already gone — there is nobody left to tell.
      }
    }
  };

  const open = async (url: string, connection: Connection, send: (message: ServerMessage) => void): Promise<void> => {
    // One clock stamped at the handshake serves both the short `socket.upgrade`
    // span and the whole-connection `socket.close` span from the same origin.
    const upClock = emit === undefined ? undefined : spanClock();
    const params = parametersOf(url);
    const mismatch = protocolRefusal(params);
    if (mismatch !== undefined) {
      send(mismatch);
      connection.close(CLOSE_PROTOCOL_MISMATCH, 'protocol mismatch');
      return;
    }
    const asking = await whoIsAsking(url, connection.upgrade, config, notOwn);
    if (asking === 'invalid_token') {
      if (emit !== undefined && upClock !== undefined) {
        emit({ name: 'socket.upgrade', startUnixNano: upClock.startUnixNano, endUnixNano: upClock.endUnixNano(), status: 'refused', attributes: { hasPrincipal: false } });
      }
      send({ type: 'error', code: 'invalid_token', message: 'The session token did not resolve to a principal.' });
      connection.close(CLOSE_INVALID_TOKEN, 'invalid token');
      return;
    }
    const { token, principal, seal } = asking;
    if (asking.cookies.length > 0) connection.upgrade?.answer?.(asking.cookies);
    if (seal !== null) connection.seal = (granted) => sealSession(seal, granted);
    // The terminal is told, and stops asking to be handed sign-ins sealed —
    // the next one reaches it as a token, on this connection already.
    if (asking.sealLost) {
      send({ type: 'error', code: 'seal_not_kept', message: 'This browser did not keep the cookie a sealed sign-in is opened with. Sign in again: it will be handed over as a token.' });
    }

    revalidation.hold(connection, token !== null && token !== '' && principal !== null ? { token, principal } : null);
    connection.onClose(() => revalidation.release(connection));
    // The connection's whole life, closed by the same clock — how long
    // terminals stay, and under a principal or anonymous. Registered here so it
    // fires however the connection ends (graceful, expiry, transport drop).
    if (emit !== undefined && upClock !== undefined) {
      const hadPrincipal = principal !== null;
      connection.onClose(() => emit({ name: 'socket.close', startUnixNano: upClock.startUnixNano, endUnixNano: upClock.endUnixNano(), status: 'ok', attributes: { hasPrincipal: hadPrincipal } }));
    }

    // The catalog channel: the application, resolved for YOU, on every
    // (re)connect — reconnect re-sends current state, no replay machinery.
    const { ids, hash } = await config.catalog(principal);
    send({ type: 'hello', protocol: PROTOCOL, principal, catalog: { actions: ids, hash } });

    // The canvas streams: attach to the session's shell (durable per
    // principal — the shell outlives this connection) and it re-sends the
    // current trees; every change fans out to every attached connection.
    // Frame deltas are OPT-IN by the terminal, on the upgrade URL — the
    // capability has to be known before the first frame is sent. A terminal
    // that says nothing is served whole frames forever, which is what every
    // terminal built before this existed does.
    const wantsDelta = params.get('delta') === '1';
    const session = await sessionFor(config, params, token, principal);
    if (session !== undefined) {
      session.attach(connection, { delta: wantsDelta });
      connection.onClose(() => session.detach(connection));
    }

    // Admitted: the handshake resolved a principal, said hello, and attached a
    // shell. The span measures that, not the connection's life (that is
    // `socket.close`).
    if (emit !== undefined && upClock !== undefined) {
      emit({ name: 'socket.upgrade', startUnixNano: upClock.startUnixNano, endUnixNano: upClock.endUnixNano(), status: 'ok', attributes: { hasPrincipal: principal !== null } });
    }

    connection.onMessage(messageHandler(session, connection, send));
  };

  return Object.assign(accept, { stop: revalidation.stop });
};
