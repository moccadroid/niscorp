import { z } from 'zod';
import type { NiscRuntime, SessionVerifier } from '../runtime';
import { revokeAllFor, sessionOf } from './sessions';

export const sessionVerifierOf = (runtime: Pick<NiscRuntime, 'session' | 'pool'>): SessionVerifier => {
  const chosen = runtime.session;
  // The type requires the field, so only a JS config reaches this.
  if (chosen === undefined) {
    throw new Error(
      'moss: `runtime.session` is unset — authentication is the one door that must not default open. ' +
        "Choose: 'sessions' (moss's stored credential: mintSession, revokeAllFor), 'dev-open' (every token is trusted; development only), or your own verifier function.",
    );
  }
  if (chosen === 'sessions') return (token) => sessionOf(runtime.pool, token);
  if (chosen === 'dev-open') {
    console.error('[moss] session: dev-open — every well-formed token is trusted, and a forged principal walks in. Development only.');
    return devSession;
  }
  console.info(`[moss] session: a function the app supplied${chosen.name === '' ? '' : ` (\`${chosen.name}\`)`} decides who a token is.`);
  return chosen;
};

export const sessionRevokerOf = (runtime: Pick<NiscRuntime, 'session' | 'pool'>): ((principal: string) => Promise<void>) | undefined =>
  runtime.session === 'sessions' ? (principal) => revokeAllFor(runtime.pool, principal) : undefined;

export const mintDevToken = (sub: string, claims: Record<string, unknown> = {}): string =>
  btoa(JSON.stringify({ sub, ...claims, iat: Date.now() }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const DevTokenSchema = z.object({ sub: z.string() });

export const devSession = (token: string): string | null => {
  try {
    const parsed = DevTokenSchema.safeParse(JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/'))));
    return parsed.success ? parsed.data.sub : null;
  } catch {
    return null;
  }
};
