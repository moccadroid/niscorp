import type { NiscRuntime, SessionVerifier } from '../runtime';
import { devSession } from './dev-token';
import { sessionOf } from './sessions';

// The three-way choice, resolved once at boot (../server.ts). Typed callers
// cannot reach the refusal — the field is required — but a JS config can,
// and the sentence names the choices rather than assuming the reader has
// the type open.
export const sessionVerifierOf = (runtime: Pick<NiscRuntime, 'session' | 'pool'>): SessionVerifier => {
  const chosen = runtime.session;
  if (chosen === undefined) {
    throw new Error(
      "moss: `runtime.session` is unset — authentication is the one door that must not default open. Choose: 'sessions' (moss's stored credential: mintSession/sessionOf/revokeSession), 'dev-open' (every token is trusted; development only), or your own verifier function.",
    );
  }
  if (chosen === 'sessions') return (token) => sessionOf(runtime.pool, token);
  if (chosen === 'dev-open') {
    console.error('[moss] session: dev-open — every well-formed token is trusted, and a forged principal walks in. Development only.');
    return devSession;
  }
  return chosen;
};
