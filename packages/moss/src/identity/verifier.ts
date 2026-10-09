import type { NiscRuntime, SessionVerifier } from '../runtime';
import { devSession } from './dev-token';
import { sessionOf } from './sessions';

// The three-way choice, resolved once at boot (../server.ts). Typed callers
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
      "moss: `runtime.session` is unset — authentication is the one door that must not default open. Choose: 'sessions' (moss's stored credential: mintSession/sessionOf/revokeSession), 'dev-open' (every token is trusted; development only), or your own verifier function.",
    );
  }
  if (chosen === 'sessions') return (token) => sessionOf(runtime.pool, token);
  if (chosen === 'dev-open') {
    console.error('[moss] session: dev-open — every well-formed token is trusted, and a forged principal walks in. Development only.');
    return devSession;
  }
  // SAID, as dev-open is. A function is the app's own door, and moss cannot
  // tell an identity provider from a stub that trusts whatever it is shown:
  // the dev verifier, handed over as a function, used to boot without a word.
  // One line names the choice, so it is in the log of every deployment that
  // made it.
  console.info(`[moss] session: a function the app supplied${chosen.name === '' ? '' : ` (\`${chosen.name}\`)`} decides who a token is.`);
  return chosen;
};
