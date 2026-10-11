import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Data } from '../data';
import type { Identity } from '../identity';
import type { NiscApp, RunningManifest } from '../manifest';
import type { NiscRuntime, SessionVerifier } from '../runtime';
import type { CredentialAnswer } from '../feature';
import type { Env } from './moss-server';

// ═══════════════════════════════════════════════════════════════
// THE SERVER'S OWN SURFACES, mounted in the order a request meets them:
//
//   every route           the authentication (`authentication`, below)
//   /catalog              the application, resolved for the caller
//   /api/vex              reads and writes, locked, scoped per principal
//   /api/<resource>/vex   one for each resource the app declares
//
// THE ORDER IS THE PROPERTY. Hono composes matched handlers in the order they
// were added, so the authentication is added before any route, and a
// feature's routes — mounted when the feature starts — after these. The
// operator prefix is the last thing mounted (`operatorPrefix`, below).
// ═══════════════════════════════════════════════════════════════

export type RouteDeps = {
  app: Pick<NiscApp, 'resources'>;
  session: SessionVerifier;
  // The credentials features register, read at each request.
  credentials: readonly FeatureCredential[];
  identity: Pick<Identity, 'resolve' | 'composeScope'>;
  running: Pick<RunningManifest, 'catalogFor'>;
  data: Pick<Data, 'routes'>;
};

export const mountRoutes = (server: Hono<Env>, { app, session, credentials, identity, running, data }: RouteDeps): void => {
  server.use('*', authentication({ session, credentials, resolve: identity.resolve }));

  // /catalog — the application, resolved for YOU.
  server.get('/catalog', (c) => {
    const principal = c.get('principal');
    const resolved = c.get('resolved');
    const { ids, hash } = running.catalogFor(resolved.roles, resolved.installed);
    return c.json({ principal, actions: ids, hash });
  });

  // The vex surfaces (../data, routes.ts) — the adapter does the work; the
  // server says WHO. Locked always; scope values and the compiled policy both
  // come from the principal, never from the request.
  server.route(
    '/',
    data.routes<Env>({
      resources: app.resources,
      // `userId` is always the principal; the app's `scope` hook contributes
      // whatever else a principal is (a tenant, an org). Merged server-side,
      // unforgeable by the request — a `to:` in a behavior resolves here.
      // The session's stable values, then the clock's. `scope` is applied
      // last and per request so a value derived from today's date cannot be
      // held for the life of a session that began yesterday.
      scope: (c) => identity.composeScope(c.get('principal'), c.get('resolved')),
      caller: (c) => c.get('resolved'),
    }),
  );
};

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

// A credential a feature registered: the prefix its tokens carry, and who one
// of them is.
export type FeatureCredential = { prefix: string; principalOf: (token: string, request: Request) => Promise<CredentialAnswer> };

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
const authenticateRequest = async (deps: AuthenticationDeps, header: string | undefined, request: Request): Promise<Found> => {
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
      found = await authenticateRequest(deps, c.req.header('Authorization'), c.req.raw);
    } catch (error) {
      // AN UNKNOWN PRINCIPAL IS A FAILED SIGN-IN. A FAILURE TO FIND OUT IS NOT.
      // The verifier says a token is nobody's by answering null, and that is
      // the 401 above. What THROWS on the way is the server's own trouble: the
      // database is down, the app's identity record does not parse, a
      // feature's credential cannot be read. A 401 would tell a client to throw
      // its session away over a fault that is not its own, so it is logged here
      // and answered as what it is. None of the error's text is sent: it can
      // name a host, a table, a user.
      console.error('[moss] who is calling could not be found out — answering 500:', error);
      return c.json({ error: 'identity_failed', message: 'The server could not find out who is calling. Why is in its log, not here.' }, 500);
    }
    if ('refused' in found) return c.json({ error: found.refused.error, message: found.refused.message }, found.refused.status);
    c.set('principal', found.principal);
    c.set('resolved', found.resolved);
    return next();
  };

// THE OPERATOR PREFIX — keyed, principal-less, and 404 without: a stranger
// who finds the path gets the same answer as a stranger with a wrong key,
// which is nothing. The server has no operator route of its own; a feature
// mounts its routes here, and the prefix is mounted once every feature has.

// Constant-time credential comparison. Both sides are hashed to a fixed 32-byte
// width first, so the compare never branches on length: a short guess is refused
// in the same time as a correct-length one (a bare length check would leak the
// key's length), and `timingSafeEqual` — which throws on a length mismatch — is
// always handed two equal-width digests. The timing signal a REMOTE attacker
// could read here is nanoseconds under microseconds of network jitter and is not
// the point; add-on containers are co-located on a shared network, and the least
// -trusted code in the deployment, facing far less jitter, is.
export const secretsEqual = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

// THE TWO GATES GUARDING THE OPERATOR PREFIX, installed in the order they must
// run. Registration order IS the security property: Hono composes matched
// handlers in the order they were added, so the app's gate has to be added
// before moss's key check to run before it, and both before the routes to wrap
// them. Added in any other order, an app's own `/operator/*` middleware would run
// AFTER moss's and, on moss's own routes, never: moss would answer every refusal
// and the app's gate would be unreachable on the one path that matters.
//
// The app's gate (if any) runs first: returning a Response refuses; calling
// `next()` and returning falls through to moss's key check. Either way moss's
// own check still runs on every path the gate lets through, so the seam can only
// HARDEN the prefix — add a second lock, never remove moss's. Awaiting `next()`
// lets the gate observe the OUTCOME (moss's own 404, an approval's 422), which
// is what makes auditing the consequential acts here honest rather than a log of
// attempts.
export const guardOperator = (operator: Hono<Env>, opts: { key: string; gate?: NiscRuntime['operatorGate'] }): void => {
  const gate = opts.gate;
  // The context is typed here because Hono leaves what a route was handed as
  // `any`, and it is handed on to the app's gate.
  if (gate !== undefined) operator.use('*', (c: Context<Env>, next) => Promise.resolve(gate(c, next)));
  operator.use('*', async (c, next) => {
    const presented = c.req.header('x-operator-key') ?? '';
    if (opts.key === '' || !secretsEqual(presented, opts.key)) return c.json({ message: 'Not found.' }, 404);
    return next();
  });
};

// The prefix, with its two gates on it and no route yet: the constant-time key
// check, and the app's own gate over the whole prefix if it supplied one
// (`runtime.operatorGate`).
export const operatorPrefix = (runtime: Pick<NiscRuntime, 'operatorKey' | 'operatorGate'>): Hono<Env> => {
  const operator = new Hono<Env>();
  guardOperator(operator, { key: runtime.operatorKey ?? '', gate: runtime.operatorGate });
  return operator;
};
