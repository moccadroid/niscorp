import { z } from 'zod';
import type { NiscRuntime, SessionVerifier } from '../runtime';
import { revokeAllFor, sessionOf } from './sessions';

// The three-way choice, resolved once at boot (../server). Typed callers
// cannot reach the refusal — the field is required — but a JS config can,
// and the sentence names the choices rather than assuming the reader has
// the type open.
//
// `devSession` is reachable here and nowhere else: the package does not export
// it, so the one way to run on it is to ask for 'dev-open' and be told so.
export const sessionVerifierOf = (runtime: Pick<NiscRuntime, 'session' | 'pool'>): SessionVerifier => {
  const chosen = runtime.session;
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
  // SAID, as dev-open is. A function is the app's own door, and moss cannot
  // tell an identity provider from a stub that trusts whatever it is shown.
  // One line names the choice, so it is in the log of every deployment that
  // made it.
  console.info(`[moss] session: a function the app supplied${chosen.name === '' ? '' : ` (\`${chosen.name}\`)`} decides who a token is.`);
  return chosen;
};

// HOW EVERY SESSION A PRINCIPAL HOLDS IS FORGOTTEN, for a sign-out: the twin
// of the choice above. Under moss's own credential the rows are deleted. A
// verifier of the app's own keeps its credential where moss cannot reach, and
// the app revokes it; 'dev-open' stores none. For those two there is nothing
// here to forget, and the answer is undefined.
export const sessionRevokerOf = (runtime: Pick<NiscRuntime, 'session' | 'pool'>): ((principal: string) => Promise<void>) | undefined =>
  runtime.session === 'sessions' ? (principal) => revokeAllFor(runtime.pool, principal) : undefined;

// The dev token pair — mint on the client stub, verify on the server;
// base64url JSON, `sub` is the principal. No signature, no expiry: anybody
// who can spell a principal's id can be them. Reachable ONLY through
// `session: 'dev-open'`, which announces itself at boot. Real credentials
// live in ./sessions.ts.
export const mintDevToken = (sub: string, claims: Record<string, unknown> = {}): string =>
  btoa(JSON.stringify({ sub, ...claims, iat: Date.now() }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

// What a dev token is read for: its `sub`. Whatever else was minted into it
// rides along unread.
const DevTokenSchema = z.object({ sub: z.string() });

export const devSession = (token: string): string | null => {
  try {
    const parsed = DevTokenSchema.safeParse(JSON.parse(atob(token.replace(/-/g, '+').replace(/_/g, '/'))));
    return parsed.success ? parsed.data.sub : null;
  } catch {
    return null;
  }
};
