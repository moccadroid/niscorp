import { isOwnOrigin, newSeal, openSealed, sealCookie, sealOf, sessionCookies, sessionTokenOf } from '../identity';
import { DEFAULT_TOKEN_KEY, PROTOCOL, PROTOCOL_MIN, offeredSealed, offeredToken } from '../protocol';
import type { ServerMessage } from '../protocol';
import type { SocketConfig } from './config';
import type { Connection } from './connection';

// ═══════════════════════════════════════════════════════════════
// THE HANDSHAKE — who is asking, decided on the upgrade request and before
// the connection is used at all.
//
// Three things ride the request: the protocol the terminal speaks (its
// address), a token it offers (a subprotocol, ../protocol), and what its
// browser holds for the app's own page (two cookies the page cannot read,
// ../identity: the session, and the seal a sign-in is handed over under).
// What comes out is who the terminal is, by which token, and what the answer
// to the upgrade is to carry.
// ═══════════════════════════════════════════════════════════════

// The address an upgrade was made to, as its parameters.
export const parametersOf = (url: string): URLSearchParams => new URL(url, 'http://nisc.local').searchParams;

// A terminal that speaks a protocol this server does not is told which side
// is behind, and is served nothing. Undefined: it speaks one this server does.
export const protocolRefusal = (params: URLSearchParams): ServerMessage | undefined => {
  const spoken = Number(params.get('protocol') ?? '1');
  if (Number.isInteger(spoken) && spoken >= PROTOCOL_MIN && spoken <= PROTOCOL) return undefined;
  const behind = spoken > PROTOCOL ? 'server' : 'client';
  return {
    type: 'error',
    code: `${behind}_too_old`,
    message: `This terminal speaks protocol ${params.get('protocol') ?? '1'}; this server speaks ${PROTOCOL_MIN}–${PROTOCOL}. ${behind === 'client' ? 'Reload the terminal to get the current build.' : 'The server has not been updated yet.'}`,
  };
};

// WHO IS ASKING, settled.
export type Admission = {
  // The token the connection is admitted on, and who it is. Both null: nobody
  // signed in.
  token: string | null;
  principal: string | null;
  // The `Set-Cookie` values the answer to the upgrade is to carry.
  cookies: readonly string[];
  // The seal this browser's sign-ins are handed over under, or null: a
  // sign-in on this connection is handed over as its token.
  seal: string | null;
  // A sealed sign-in came back with no seal to open it: this browser does not
  // keep the cookie.
  sealLost: boolean;
};

// Said once for a socket: nothing else would tell a deployment that its pages
// are being read as somebody else's.
export type SaidOnce = { said: boolean };

// The answer `'invalid_token'`: the terminal offered a token and it is nobody's.
export const whoIsAsking = async (url: string, upgrade: Connection['upgrade'], config: Pick<SocketConfig, 'session' | 'origins' | 'sessionLastsMs'>, notOwn: SaidOnce): Promise<Admission | 'invalid_token'> => {
  const params = parametersOf(url);
  // THE APP'S OWN PAGE does not hold its session: its browser does, in a
  // cookie the page cannot read (../identity, session-cookie.ts), and sent it
  // with this request. From any other origin the cookie is not looked at — a
  // browser sends it with a stranger's page all the same. `key` is which of
  // the browser's sessions this terminal is (a seat); a name, not a secret.
  const named = params.get('key');
  const key = named !== null && /^[\w.-]{1,64}$/.test(named) ? named : DEFAULT_TOKEN_KEY;
  const page = upgrade !== undefined && isOwnOrigin(upgrade.origin, upgrade.host, config.origins) ? new URL(upgrade.origin) : undefined;
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
  if (page === undefined && params.get('sealed') === '1' && typeof upgrade?.origin === 'string' && !notOwn.said) {
    notOwn.said = true;
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
  const carried = offered ?? (params.get('leave') === '1' ? null : (held?.token ?? null));
  const principal = carried === null ? null : await config.session(carried);
  if (offered !== null && principal === null) return 'invalid_token';
  // What the browser held and no longer resolves is nobody — not a refusal:
  // the page cannot read it to drop it, so a 4401 would be one it could
  // never stop getting.
  const token = principal === null ? null : carried;
  // THE ANSWER makes the browser hold who this turned out to be. A token the
  // page offered — left in storage by an earlier build, or just handed to it
  // at sign-in — is moved into the cookie, and that was the last time the
  // page held it; a session that ended is taken back. An offered token is
  // written even when the browser sent the same one: over plain http on the
  // default port the copy an earlier build kept, readable by script, has
  // this cookie's name.
  const cookies = [
    ...(page === undefined || (offered === null && (held?.token ?? null) === token) ? [] : token === null ? (held?.clear ?? []) : sessionCookies(page.origin, token, { key, lastsMs: (await config.sessionLastsMs?.(token)) ?? null })),
    ...(seal !== null && hadSeal === null ? [sealCookie(seal, { secure, path: new URL(url, 'http://nisc.local').pathname })] : []),
  ];
  return { token, principal, cookies, seal, sealLost };
};
