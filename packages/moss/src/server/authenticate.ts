import type { MiddlewareHandler } from 'hono';
import type { CredentialAnswer } from '../feature';
import { SESSION_TOKEN_PREFIX } from '../identity';
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

// A credential a feature registered: the feature, the prefix its tokens
// carry, and who one of them is.
export type FeatureCredential = { feature: string; prefix: string; principalOf: (token: string, request: Request) => Promise<CredentialAnswer> };

// One is the start of the other: a token that starts with the longer starts
// with both.
const overlap = (one: string, other: string): boolean => one.startsWith(other) || other.startsWith(one);

// A CREDENTIAL IS REACHED BY ITS PREFIX, SO A PREFIX IS HELD TO BEING ONE.
// The door (`whoIsCalling`, below) hands a token to the credential whose
// prefix the token starts with, and to the session verifier when none does.
// So what is registered decides whose tokens a feature is handed, and a
// feature anybody writes registers one. Three things are refused, here, where
// it is registered: while the feature starts, so the boot is refused with the
// sentence.
//   - An empty prefix. Every token starts with nothing: the feature would be
//     handed every token there is, each person's session included.
//   - A prefix that is the start of another feature's, or starts with it, the
//     same one included. Which of the two read a token would be whichever
//     started first.
//   - A prefix that overlaps the one moss's own stored sessions carry: in a
//     deployment that keeps them, a person's session would be the feature's.
export const registerCredential = (held: FeatureCredential[], credential: FeatureCredential): void => {
  const { feature, prefix } = credential;
  if (prefix === '') {
    throw new Error(
      `moss: the feature "${feature}" registered a credential with an empty prefix. ` +
        'A token is handed to the credential whose prefix it starts with, and every token starts with nothing: ' +
        "this one would be handed every token there is, each person's session included. " +
        'Give the tokens the feature issues a prefix of their own (an integration key starts "ik_"), and register that.',
    );
  }
  const reads = `moss: the feature "${feature}" registered a credential for tokens that start with "${prefix}"`;
  if (overlap(prefix, SESSION_TOKEN_PREFIX)) {
    throw new Error(
      `${reads}, and the sessions moss keeps itself start with "${SESSION_TOKEN_PREFIX}". ` +
        "One is the start of the other, so in a deployment that keeps them (`session: 'sessions'`) a person's session would be handed to the feature. " +
        'Give its tokens a prefix that shares no start with that one.',
    );
  }
  const other = held.find((registered) => overlap(prefix, registered.prefix));
  if (other !== undefined) {
    throw new Error(
      `${reads}, and the feature "${other.feature}" reads the ones that start with "${other.prefix}". ` +
        'One is the start of the other, so which of the two a token is handed to would be decided by the order the features start in. ' +
        'Give each a prefix no other begins with.',
    );
  }
  held.push(credential);
};

export type AuthenticationDeps = {
  // Who a token is (`runtime.session`, ../identity): null is a refusal.
  session: SessionVerifier;
  // The credentials features registered. Read at each request: a feature
  // registers when it starts, after this middleware is mounted.
  credentials: readonly FeatureCredential[];
  // Who a principal is (../identity).
  resolve: Identity['resolve'];
};

// What the door found: who is calling, or what to answer instead.
type Found = { principal: string | null; resolved: Env['Variables']['resolved'] } | { refused: { status: 401 | 403; error: string; message: string } };

const INVALID_TOKEN = { refused: { status: 401, error: 'invalid_token', message: 'The session token did not resolve to a principal.' } } as const;

// WHO IS CALLING, from the `Authorization` header. ONE resolution, here, for
// everything downstream.
const whoIsCalling = async (deps: AuthenticationDeps, header: string | undefined, request: Request): Promise<Found> => {
  if (header === undefined) return { principal: null, resolved: await deps.resolve(null) };
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
  const credential = deps.credentials.find(({ prefix }) => token.startsWith(prefix));
  if (credential !== undefined) {
    const answer = await credential.principalOf(token, request);
    if ('refused' in answer) return answer;
    return { principal: answer.principal, resolved: await deps.resolve(answer.principal) };
  }
  const principal = await deps.session(token);
  if (principal === null) return INVALID_TOKEN;
  return { principal, resolved: await deps.resolve(principal) };
};

export const authentication =
  (deps: AuthenticationDeps): MiddlewareHandler<Env> =>
  async (c, next) => {
    let found: Found;
    try {
      found = await whoIsCalling(deps, c.req.header('Authorization'), c.req.raw);
    } catch (error) {
      // AN UNKNOWN PRINCIPAL IS A FAILED SIGN-IN. A FAILURE TO FIND OUT IS NOT.
      // The verifier says a token is nobody's by answering null, and that is
      // the 401 above. What THROWS on the way is the server's own trouble: the
      // database is down, the app's identity record does not parse, a
      // feature's credential cannot be read. Answered 401 it told a client to
      // throw its session away over a fault that was never its own, and
      // nothing was logged. It is said here and answered as what it is. None
      // of the error's text is sent: it can name a host, a table, a user.
      console.error('[moss] who is calling could not be found out — answering 500:', error);
      return c.json({ error: 'identity_failed', message: 'The server could not find out who is calling. Why is in its log, not here.' }, 500);
    }
    if ('refused' in found) return c.json({ error: found.refused.error, message: found.refused.message }, found.refused.status);
    c.set('principal', found.principal);
    c.set('resolved', found.resolved);
    return next();
  };
