import type { MiddlewareHandler } from 'hono';
import type { CredentialAnswer } from '../feature';
import type { Identity } from '../identity';
import type { SessionVerifier } from '../runtime';
import type { Env } from './moss-server';

// ═══════════════════════════════════════════════════════════════
// THE AUTHENTICATION every route gets — who is calling, decided once, at the
// door, for every surface behind it.
//
// Bearer token → principal. Absent header → the anonymous principal
// (anonymity is a principal, not an error). Invalid token → 401 (an explicit
// reject beats a silent downgrade to anonymous).
//
// A FEATURE'S OWN CREDENTIAL is the second way in, routed by its prefix (an
// integration's key). The feature says which principal the token stands for,
// or what to answer instead; the principal is resolved here like any other,
// and from that line on nothing downstream can tell it from a person.
// ═══════════════════════════════════════════════════════════════

// A credential a feature registered: the prefix its tokens carry, and who one
// of them is.
export type FeatureCredential = { prefix: string; principalOf: (token: string, request: Request) => Promise<CredentialAnswer> };

export type AuthenticationConfig = {
  // Who a token is (`runtime.session`, ../identity): null is a refusal.
  session: SessionVerifier;
  // The credentials features registered. Read at each request: a feature
  // registers when it starts, after this middleware is mounted.
  credentials: readonly FeatureCredential[];
  // Who a principal is (../identity).
  resolve: Identity['resolve'];
};

export const authentication =
  (config: AuthenticationConfig): MiddlewareHandler<Env> =>
  async (c, next) => {
    const header = c.req.header('Authorization');
    if (header === undefined) {
      c.set('principal', null);
      c.set('resolved', await config.resolve(null));
      return next();
    }
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
    const credential = config.credentials.find(({ prefix }) => token.startsWith(prefix));
    if (credential !== undefined) {
      const answer = await credential.principalOf(token, c.req.raw);
      if ('refused' in answer) return c.json({ error: answer.refused.error, message: answer.refused.message }, answer.refused.status);
      c.set('principal', answer.principal);
      c.set('resolved', await config.resolve(answer.principal));
      return next();
    }
    const principal = await config.session(token);
    if (principal === null) {
      return c.json({ error: 'invalid_token', message: 'The session token did not resolve to a principal.' }, 401);
    }
    c.set('principal', principal);
    // ONE resolution, here, for everything downstream. A token that verifies to
    // a principal the application cannot resolve is a 401 rather than a crash:
    // an unknown principal is a failed sign-in, not a server fault.
    try {
      c.set('resolved', await config.resolve(principal));
    } catch {
      return c.json({ error: 'no_identity', message: 'The session token did not resolve to a principal.' }, 401);
    }
    return next();
  };
