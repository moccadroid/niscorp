import { z } from 'zod';
import { newSeal, openSealed, sealCookie, sealOf, ownOriginOf, sessionCookies, sessionTokenOf } from '../identity';
import { DEFAULT_TOKEN_KEY, PROTOCOL, PROTOCOL_MIN, offeredSealed, offeredToken } from '../protocol';
import type { ServerMessage } from '../protocol';
import type { Connection, SocketConfig } from './types';

const flag = z.literal('1').optional().catch(undefined);
const UpgradeParametersSchema = z.object({
  protocol: z.string().default('1'),
  key: z.string().regex(/^[\w.-]{1,64}$/).optional().catch(undefined),
  seed: z.string().regex(/^[0-9a-f]{8,40}$/).optional().catch(undefined),
  path: z.string().optional(),
  delta: flag,
  sealed: flag,
  leave: flag,
});
export type UpgradeParameters = z.infer<typeof UpgradeParametersSchema>;

export const parametersOf = (url: string): UpgradeParameters => {
  const written = new URL(url, 'http://nisc.local').searchParams;
  return UpgradeParametersSchema.parse(Object.fromEntries(Object.keys(UpgradeParametersSchema.shape).map((name) => [name, written.get(name) ?? undefined])));
};

// Digits only: `Number()` would read `0x2`, `2.0`, `2e0` and ` 2` as protocol 2.
const SpokenProtocolSchema = z.string().regex(/^\d{1,15}$/).transform(Number);

export const protocolRefusal = (parameters: UpgradeParameters): ServerMessage | undefined => {
  const spoken = SpokenProtocolSchema.safeParse(parameters.protocol);
  if (spoken.success && spoken.data >= PROTOCOL_MIN && spoken.data <= PROTOCOL) return undefined;
  const behind = spoken.success && spoken.data > PROTOCOL ? 'server' : 'client';
  return {
    type: 'error',
    code: `${behind}_too_old`,
    message:
      `This terminal speaks protocol ${parameters.protocol}; this server speaks ${PROTOCOL_MIN}–${PROTOCOL}. ` +
      (behind === 'client' ? 'Reload the terminal to get the current build.' : 'The server has not been updated yet.'),
  };
};

export type Admission = {
  token: string | null;
  principal: string | null;
  cookies: readonly string[];
  seal: string | null;
  sealLost: boolean;
};

export type WarnedOnce = { warned: boolean };

export const authenticateUpgrade = async (
  url: string,
  upgrade: Connection['upgrade'],
  config: Pick<SocketConfig, 'session' | 'origins' | 'sessionLastsMs'>,
  notOwn: WarnedOnce,
): Promise<Admission | 'invalid_token'> => {
  const parameters = parametersOf(url);
  const key = parameters.key ?? DEFAULT_TOKEN_KEY;
  const page = upgrade === undefined ? undefined : ownOriginOf(upgrade.origin, upgrade.host, config.origins);
  const secure = page?.protocol === 'https:';
  // The session cookie is read for the app's own page only: a browser sends it
  // with a stranger's page all the same.
  const held = page === undefined ? null : sessionTokenOf(upgrade?.cookie, { port: page.port, secure }, key);
  // A sign-in over the socket is handed to the page sealed. The browser of a
  // terminal that says `sealed=1` is given a seal (a key in a cookie no script
  // reads) by the answer to its first upgrade; the page offers the sealed
  // sign-in back here, and only that seal opens it.
  const sealing = page !== undefined && parameters.sealed === '1';
  if (page === undefined && parameters.sealed === '1' && typeof upgrade?.origin === 'string' && !notOwn.warned) {
    notOwn.warned = true;
    console.warn(
      `[moss] a terminal on ${upgrade.origin} holds its own session token: this server was addressed as ${upgrade.host ?? 'nothing'}, so that is not the app’s own page. ` +
        'If the app is served there, behind a proxy that rewrites Host, list it in runtime.origins.',
    );
  }
  const hadSeal = sealing ? sealOf(upgrade?.cookie, secure) : null;
  const sealedOffer = offeredSealed(upgrade?.offered);
  const sealLost = sealing && sealedOffer !== null && hadSeal === null;
  const seal = !sealing || sealLost ? null : (hadSeal ?? (upgrade?.answer === undefined ? null : newSeal()));
  const offered = offeredToken(upgrade?.offered) ?? (sealedOffer === null || hadSeal === null ? null : await openSealed(hadSeal, sealedOffer));
  // `leave`: the terminal was signed out. It says so because the cookie may
  // hold a token that still resolves (an app's own provider's is not moss's to
  // revoke).
  const carried = offered ?? (parameters.leave === '1' ? null : (held?.token ?? null));
  const principal = carried === null ? null : await config.session(carried);
  if (offered !== null && principal === null) return 'invalid_token';
  // A cookie's token that no longer resolves is nobody, not a refusal: the page
  // cannot drop a cookie it cannot read, and would be refused for ever.
  const token = principal === null ? null : carried;
  // An offered token is written even when the browser sent the same one: over
  // plain http on the default port a copy readable by script has this cookie's
  // name.
  const cookies = [
    ...(page === undefined || (offered === null && (held?.token ?? null) === token)
      ? []
      : token === null
        ? (held?.clear ?? [])
        : sessionCookies(page.origin, token, { key, lastsMs: (await config.sessionLastsMs?.(token)) ?? null })),
    ...(seal !== null && hadSeal === null ? [sealCookie(seal, { secure, path: new URL(url, 'http://nisc.local').pathname })] : []),
  ];
  return { token, principal, cookies, seal, sealLost };
};
