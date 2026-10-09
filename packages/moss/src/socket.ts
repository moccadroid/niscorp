import { DefinitionValidationError } from '@niscorp/nova';
import type { RenderNode } from '@niscorp/nova';
import type { Catalog } from './principal';
import { CLOSE_INVALID_TOKEN, CLOSE_PROTOCOL_MISMATCH, CLOSE_SHELL_FAILED, ClientMessageSchema, DEFAULT_TOKEN_KEY, PROTOCOL, PROTOCOL_MIN, offeredSealed, offeredToken } from './protocol';
import type { ClientMessage, ServerMessage } from './protocol';
import type { ShellHost } from './shells';
import { emitterOf, spanClock } from './telemetry';
import type { Telemetry } from './telemetry';
import { isOwnOrigin, newSeal, openSealed, sealCookie, sealOf, sealSession, sessionCookies, sessionTokenOf } from './session-cookie';

// ═══════════════════════════════════════════════════════════════
// The socket — the authority channel (DESIGN.md § The socket), protocol layer.
//
// The socket invents nothing: JSON frames, every canvas-bound message
// carries its canvas id, reconnect just re-sends current state. This
// module is transport-blind — it speaks through the four-function
// `Connection` seam; the RFC 6455 plumbing lives with each runtime's
// entry (`ws` on Node in ./node, Bun-native later) and is never
// hand-written.
//
// What rides it: connection lifecycle, token auth at upgrade, the CATALOG
// channel (`hello` on connect — the resolved application + its version
// token; equal hash, equal application), and the canvas streams (`render`
// down, `event` up) fed by the server shell host. An app whose manifest
// declares no shell has no streams, and an event envelope aimed at one is
// answered honestly with `no_shell` rather than silently dropped.
//
// Identity is asked twice: once at upgrade, and then on a timer for as long
// as the connection lives (see DEFAULT_REVALIDATE_MS). The second is what
// lets a `session` verifier's expiry mean anything here — the HTTP surfaces
// re-ask on every request, and a socket that asked once would be the hole
// every long-lived credential leaks through.
// ═══════════════════════════════════════════════════════════════

// The transport seam — what a runtime's websocket must provide. Four
// functions, and what the request that opened the connection offered;
// everything above them is identical on every runtime.
export type Connection = {
  send: (text: string) => void;
  close: (code?: number, reason?: string) => void;
  onMessage: (fn: (text: string) => void) => void;
  onClose: (fn: () => void) => void;
  // The upgrade request, as far as it says who is asking: the subprotocols it
  // offered (`Sec-WebSocket-Protocol`, split), and — for a browser's session
  // (session-cookie.ts) — where the page is, where the request was addressed,
  // and the cookies it carried. A transport that leaves this out serves every
  // terminal as nobody.
  //
  // `answer`: a transport that has NOT answered the request yet says so by
  // giving this, and is told — once who is asking is decided, before the
  // connection is used at all — the `Set-Cookie` values its answer is to
  // carry: the one moment a cookie can be written. It answers when the
  // connection is first used.
  // Without it nothing is written, and a browser's terminal goes on holding
  // its own token.
  upgrade?: {
    offered: readonly string[];
    origin?: string | null;
    host?: string | null;
    cookie?: string | null;
    answer?: (cookies: readonly string[]) => void;
  };
  // Set here, not by a transport: how this connection's terminal is handed a
  // session when its browser holds a seal (session-cookie.ts) — sealed, so the
  // page carries it to the next upgrade and cannot open it. Absent, a session
  // is handed over as its token.
  seal?: (token: string) => Promise<string>;
};

export type SocketContext = {
  session: (token: string) => string | null | Promise<string | null>;
  catalog: (principal: string | null) => Catalog | Promise<Catalog>;
  // The shell host — when the manifest declares a shell, events route into
  // the session's server shell and render frames flow back.
  shells?: ShellHost;
  // WHICH HOST A PATH LEADS TO. A terminal on a page names the path it is on
  // (`?path=`); this answers with that page's host and the input its path
  // carries, or undefined for a path that is the app's. Absent: every
  // connection is the app's, as before pages existed.
  page?: (path: string) => { host: ShellHost; inputs: Record<string, Record<string, unknown>> } | undefined;
  // How often a LIVE connection's credential is re-verified. Default
  // `DEFAULT_REVALIDATE_MS`; `0` or `Infinity` disables it, and a token
  // checked once at upgrade is then trusted for the life of the connection.
  revalidateMs?: number;
  // The deployment's telemetry sink, if any — a `socket.upgrade` span per
  // connection admitted or refused, and a `socket.close` span carrying the
  // whole connection's lifetime. See telemetry.ts.
  telemetry?: Telemetry;
  // Origins that are this app's own page beside the host a request is
  // addressed to (`runtime.origins`) — a proxy that rewrites `Host`.
  origins?: readonly string[];
  // How much longer a token resolves, when the credential knows — how long a
  // browser is told to keep the cookie that carries it. Unknown: until the
  // browser closes.
  sessionLastsMs?: (token: string) => number | null | Promise<number | null>;
};

// ── Revalidation ──
// The HTTP surfaces re-ask "who is this" on every request; the socket asked
// once, at upgrade, and never again. That asymmetry is why an app could not
// give its tokens an expiry that meant anything: the verifier seam is
// perfectly able to say a token has died (return null), but on a live socket
// nobody was listening for the answer.
//
// It also failed in a shape worth naming. The server shell's own wire rides
// the HTTP middleware carrying the session's token, so an expired credential
// used to leave the socket open and cheerful — frames flowing, screen alive —
// while every endpoint the shell called came back 401. A live interface whose
// every load silently fails is strictly worse than a lock screen.
//
// The recovery for this already existed and is untouched: a `4401` close is a
// recovery, not a retry, and the terminal drops its token and reconnects
// anonymous onto the served lock screen. All that was missing was something
// asking the question. This is that.
export const DEFAULT_REVALIDATE_MS = 60 * 1000;

// One accept per new connection: authenticate (the token rides the upgrade
// URL — browsers cannot set websocket headers; absent = the anonymous
// principal, invalid = closed with 4401), then say hello with the resolved
// catalog and settle into the message loop. `stop` ends revalidation, for
// hosts that outlive their server (dev checks, embedded tools) — the timer is
// unref'd, so a plain process needn't call it.
export type SocketAccept = ((url: string, connection: Connection) => Promise<void>) & { stop: () => void };

// What a terminal sent, read as the protocol says it — or undefined: text that
// is not JSON, JSON that is not one of the protocol's messages, or one of them
// with a field it does not have.
const messageOf = (text: string): ClientMessage | undefined => {
  try {
    const read = ClientMessageSchema.safeParse(JSON.parse(text));
    return read.success ? read.data : undefined;
  } catch {
    return undefined;
  }
};

// The one answer to all three: what a message is, which is true whatever was
// sent, rather than a guess at what the sender meant.
const INVALID_MESSAGE = `Not a message of protocol ${PROTOCOL}: it must be JSON, name a type a terminal sends, and carry that type's fields and no others.`;

export const createSocket = (ctx: SocketContext): SocketAccept => {
  const emit = emitterOf(ctx.telemetry);
  let saidNotOwn = false;
  // Every live connection, with the credential it authenticated under (null =
  // anonymous, which has nothing that can expire). One structure: the future
  // catalog-push fan-out wants the keys, revalidation wants the values.
  const live = new Map<Connection, { token: string; principal: string } | null>();

  const expire = (connection: Connection): void => {
    // Diagnostics before authority, as at upgrade — the close code is what
    // the terminal acts on; this is what a person reads in a log.
    connection.send(JSON.stringify({ type: 'error', code: 'invalid_token', message: 'The session token no longer resolves to this principal.' } satisfies ServerMessage));
    connection.close(CLOSE_INVALID_TOKEN, 'session expired');
    live.delete(connection);
  };

  const revalidate = async (): Promise<void> => {
    for (const [connection, credential] of [...live]) {
      if (credential === null) continue; // anonymous — nothing to expire
      let resolved: string | null;
      try {
        resolved = await ctx.session(credential.token);
      } catch {
        // The verifier is unreachable — a database blip, a network hiccup.
        // That is not evidence a session ended, and signing everybody out on
        // it would turn a transient fault into an outage. Ask again next pass.
        continue;
      }
      // Unchanged is the overwhelmingly common answer. A token that stops
      // resolving has expired or been revoked; one that resolves to somebody
      // ELSE is not the session that attached, and both are the same close.
      if (resolved === credential.principal) continue;
      if (!live.has(connection)) continue; // it closed while we were awaiting
      expire(connection);
    }
  };

  const revalidateMs = ctx.revalidateMs ?? DEFAULT_REVALIDATE_MS;
  let sweeper: ReturnType<typeof setInterval> | undefined;
  if (revalidateMs > 0 && Number.isFinite(revalidateMs)) {
    sweeper = setInterval(() => void revalidate(), revalidateMs);
    // Revalidation must never be the reason a process stays alive.
    (sweeper as unknown as { unref?: () => void }).unref?.();
  }

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
      live.delete(connection);
      const failures =
        error instanceof DefinitionValidationError
          ? ((error.context as { failures?: { id: string }[] } | undefined)?.failures ?? []).map((f) => f.id)
          : [];
      const detail = failures.length > 0 ? `${String(error instanceof Error ? error.message : error)}: ${failures.join(', ')}` : String(error);
      try {
        send({ type: 'error', code: 'session_failed', message: `This session could not be opened — ${detail}. The refusal is this terminal's alone; the server is up.` });
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
    const params = new URL(url, 'http://nisc.local').searchParams;
    const spoken = Number(params.get('protocol') ?? '1');
    if (!Number.isInteger(spoken) || spoken < PROTOCOL_MIN || spoken > PROTOCOL) {
      const behind = spoken > PROTOCOL ? 'server' : 'client';
      send({
        type: 'error',
        code: `${behind}_too_old`,
        message: `This terminal speaks protocol ${params.get('protocol') ?? '1'}; this server speaks ${PROTOCOL_MIN}–${PROTOCOL}. ${behind === 'client' ? 'Reload the terminal to get the current build.' : 'The server has not been updated yet.'}`,
      });
      connection.close(CLOSE_PROTOCOL_MISMATCH, 'protocol mismatch');
      return;
    }
    const upgrade = connection.upgrade;
    // THE APP'S OWN PAGE does not hold its session: its browser does, in a
    // cookie the page cannot read (session-cookie.ts), and sent it with this
    // request. From any other origin the cookie is not looked at — a browser
    // sends it with a stranger's page all the same. `key` is which of the
    // browser's sessions this terminal is (a seat); a name, not a secret.
    const key = /^[\w.-]{1,64}$/.test(params.get('key') ?? '') ? (params.get('key') as string) : DEFAULT_TOKEN_KEY;
    const page = upgrade !== undefined && isOwnOrigin(upgrade.origin, upgrade.host, ctx.origins) ? new URL(upgrade.origin) : undefined;
    const secure = page?.protocol === 'https:';
    const held = page === undefined ? null : sessionTokenOf(upgrade?.cookie, { port: page.port, secure }, key);
    // A SIGN-IN OVER THE SOCKET REACHES THAT COOKIE SEALED. A terminal whose
    // browser can keep a session says so (`sealed=1`), and its browser is given
    // a seal — a key in a second cookie no script can read — by the answer to
    // its first upgrade. A sign-in is then handed to the page sealed with it;
    // the page offers it back here, and only this browser's seal opens it.
    const sealing = page !== undefined && params.get('sealed') === '1';
    // A browser terminal that is not on the app's own page works as it always
    // did, holding its own token — which is right for a page served from
    // somewhere else, and is what a proxy that rewrites `Host` looks like too.
    // Said once: nothing else would tell a deployment it is in the second case.
    if (page === undefined && params.get('sealed') === '1' && typeof upgrade?.origin === 'string' && !saidNotOwn) {
      saidNotOwn = true;
      console.warn(`[moss] a terminal on ${upgrade.origin} holds its own session token: this server was addressed as ${upgrade.host ?? 'nothing'}, so that is not the app’s own page. If the app is served there, behind a proxy that rewrites Host, list it in runtime.origins.`);
    }
    const hadSeal = sealing ? sealOf(upgrade?.cookie, secure) : null;
    const sealedOffer = offeredSealed(upgrade?.offered);
    // A sealed sign-in that came back with no seal to open it: this browser
    // does not keep the cookie, and is not handed another sign-in that way.
    const sealLost = sealing && sealedOffer !== null && hadSeal === null;
    const seal = !sealing || sealLost ? null : (hadSeal ?? (upgrade?.answer === undefined ? null : newSeal()));
    const offered = offeredToken(upgrade?.offered) ?? (sealedOffer === null || hadSeal === null ? null : await openSealed(hadSeal, sealedOffer));
    // A token the terminal offers comes first. `leave`: it was signed out, and
    // says so because what its browser holds may be a token that still
    // resolves — an app's own provider's is not moss's to revoke.
    let token = offered ?? (params.get('leave') === '1' ? null : (held?.token ?? null));
    let principal = token === null ? null : await ctx.session(token);
    if (offered !== null && principal === null) {
      if (emit !== undefined && upClock !== undefined) {
        emit({ name: 'socket.upgrade', startUnixNano: upClock.startUnixNano, endUnixNano: upClock.endUnixNano(), status: 'refused', attributes: { hasPrincipal: false } });
      }
      send({ type: 'error', code: 'invalid_token', message: 'The session token did not resolve to a principal.' });
      connection.close(CLOSE_INVALID_TOKEN, 'invalid token');
      return;
    }
    // What the browser held and no longer resolves is nobody — not a refusal:
    // the page cannot read it to drop it, so a 4401 would be one it could
    // never stop getting.
    if (principal === null) token = null;
    // THE ANSWER makes the browser hold who this turned out to be. A token the
    // page offered — left in storage by an earlier build, or just handed to it
    // at sign-in — is moved into the cookie, and that was the last time the
    // page held it; a session that ended is taken back. An offered token is
    // written even when the browser sent the same one: over plain http on the
    // default port the copy an earlier build kept, readable by script, has
    // this cookie's name.
    const answered = [
      ...(page === undefined || (offered === null && (held?.token ?? null) === token) ? [] : token === null ? (held?.clear ?? []) : sessionCookies(page.origin, token, { key, lastsMs: (await ctx.sessionLastsMs?.(token)) ?? null })),
      ...(seal !== null && hadSeal === null ? [sealCookie(seal, { secure, path: new URL(url, 'http://nisc.local').pathname })] : []),
    ];
    if (answered.length > 0) upgrade?.answer?.(answered);
    if (seal !== null) connection.seal = (granted) => sealSession(seal, granted);
    // The terminal is told, and stops asking to be handed sign-ins sealed —
    // the next one reaches it as a token, on this connection already.
    if (sealLost) {
      send({ type: 'error', code: 'seal_not_kept', message: 'This browser did not keep the cookie a sealed sign-in is opened with. Sign in again: it will be handed over as a token.' });
    }

    // Remembered WITH its credential — revalidation has to re-ask the same
    // question this connection was admitted on, and the token is not
    // recoverable from anything else here.
    live.set(connection, token !== null && token !== '' && principal !== null ? { token, principal } : null);
    connection.onClose(() => live.delete(connection));
    // The connection's whole life, closed by the same clock — how long
    // terminals stay, and under a principal or anonymous. Registered here so it
    // fires however the connection ends (graceful, expiry, transport drop).
    if (emit !== undefined && upClock !== undefined) {
      const hadPrincipal = principal !== null;
      connection.onClose(() => emit({ name: 'socket.close', startUnixNano: upClock.startUnixNano, endUnixNano: upClock.endUnixNano(), status: 'ok', attributes: { hasPrincipal: hadPrincipal } }));
    }

    // The catalog channel: the application, resolved for YOU, on every
    // (re)connect — reconnect re-sends current state, no replay machinery.
    const { ids, hash } = await ctx.catalog(principal);
    send({ type: 'hello', protocol: PROTOCOL, principal, catalog: { actions: ids, hash } });

    // The canvas streams: attach to the session's shell (durable per
    // principal — the shell outlives this connection) and it re-sends the
    // current trees; every change fans out to every attached connection.
    // Frame deltas are OPT-IN by the terminal, on the upgrade URL beside the
    // token — browsers cannot set websocket headers, and the capability has to
    // be known before the first frame is sent. A terminal that says nothing is
    // served whole frames forever, which is what every terminal built before
    // this existed does.
    const wantsDelta = params.get('delta') === '1';

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
    const route = path === null ? undefined : ctx.page?.(path);
    const host = route?.host ?? ctx.shells;

    const session = await host?.session(token, principal, { ...(seed === undefined ? {} : { seed }), ...(route === undefined ? {} : { inputs: route.inputs }) });
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

    const act = (text: string): void => {
      const message = messageOf(text);
      if (message === undefined) {
        send({ type: 'error', code: 'invalid_message', message: INVALID_MESSAGE });
        return;
      }
      // An app that declares no shell has nothing to route to, and says so
      // rather than dropping what it was sent. An event names the canvas it
      // came from, so the answer names it too.
      if (session === undefined) {
        send({ type: 'error', code: 'no_shell', message: 'This app serves no shell.', ...(message.type === 'event' ? { canvas: message.canvas } : {}) });
        return;
      }
      switch (message.type) {
        case 'reset':
          session.reset();
          return;
        case 'resync':
          session.resync(connection);
          return;
        case 'back':
          session.back();
          return;
        case 'popTo':
          session.popTo(message.canvas, message.instance);
          return;
        case 'publish':
          session.publish(message.channel, message.payload);
          return;
        case 'event':
          session.dispatch(message.canvas, message.event);
          return;
        default:
          // A message the protocol gains and this does not route fails to compile.
          message satisfies never;
      }
    };

    // NOTHING LEAVES THIS HANDLER, for the reason nothing leaves accept. A
    // transport calls it from its own listener, where a throw is an uncaught
    // exception and Node ends the process: one shell failing on one message,
    // and every session on the box is gone. What failed is logged here. The
    // terminal is told only that its message was not acted on — the error's
    // own text is the server's — and the connection stays as it was.
    connection.onMessage((text) => {
      try {
        act(text);
      } catch (error) {
        console.error('[moss/socket] a message could not be acted on:', error);
        try {
          send({ type: 'error', code: 'message_failed', message: 'The server could not act on that message. Why is in its log, not here. The connection is still open.' });
        } catch {
          // The transport is already gone — there is nobody left to tell.
        }
      }
    });
  };

  return Object.assign(accept, {
    stop: () => {
      if (sweeper !== undefined) clearInterval(sweeper);
      sweeper = undefined;
    },
  });
};
