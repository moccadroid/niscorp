import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Data } from '../data';
import type { Identity } from '../identity';
import type { NiscApp, RunningManifest } from '../manifest';
import type { NiscRuntime, SessionVerifier } from '../runtime';
import type { CredentialAnswer } from '../feature';
import type { Env } from './moss-server';

export type RouteDeps = {
  app: Pick<NiscApp, 'resources'>;
  session: SessionVerifier;
  credentials: readonly FeatureCredential[];
  identity: Pick<Identity, 'resolve' | 'composeScope'>;
  running: Pick<RunningManifest, 'catalogFor'>;
  data: Pick<Data, 'routes'>;
};

export const mountRoutes = (server: Hono<Env>, { app, session, credentials, identity, running, data }: RouteDeps): void => {
  server.use('*', authentication({ session, credentials, resolve: identity.resolve }));

  server.get('/catalog', (c) => {
    const principal = c.get('principal');
    const resolved = c.get('resolved');
    const { ids, hash } = running.catalogFor(resolved.roles, resolved.installed);
    return c.json({ principal, actions: ids, hash });
  });

  server.route(
    '/',
    data.routes<Env>({
      resources: app.resources,
      scope: (c) => identity.composeScope(c.get('principal'), c.get('resolved')),
      caller: (c) => c.get('resolved'),
    }),
  );
};

export type FeatureCredential = { prefix: string; principalOf: (token: string, request: Request) => Promise<CredentialAnswer> };

export type AuthenticationDeps = {
  session: SessionVerifier;
  credentials: readonly FeatureCredential[];
  resolve: Identity['resolve'];
};

type Found = { principal: string | null; resolved: Env['Variables']['resolved'] } | { refused: { status: 401 | 403; error: string; message: string } };

const INVALID_TOKEN = { refused: { status: 401, error: 'invalid_token', message: 'The session token did not resolve to a principal.' } } as const;

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
      // A throw is the server's own trouble, not a failed sign-in: a 401 would
      // tell a client to throw its session away. None of the error's text is
      // sent: it can name a host, a table, a user.
      console.error('[moss] who is calling could not be found out — answering 500:', error);
      return c.json({ error: 'identity_failed', message: 'The server could not find out who is calling. Why is in its log, not here.' }, 500);
    }
    if ('refused' in found) return c.json({ error: found.refused.error, message: found.refused.message }, found.refused.status);
    c.set('principal', found.principal);
    c.set('resolved', found.resolved);
    return next();
  };

// Both sides are hashed first: `timingSafeEqual` throws on a length mismatch,
// and a bare length check would leak the key's length.
export const secretsEqual = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

// Registration order is the security property: Hono runs matched handlers in
// the order they were added, so the app's gate is added before the key check
// and both before any route. The gate can only add a lock: the key check runs
// on every path it lets through. A wrong key is answered 404, as an unset one
// is: a stranger cannot tell the prefix is there.
export const guardOperator = (operator: Hono<Env>, opts: { key: string; gate?: NiscRuntime['operatorGate'] }): void => {
  const gate = opts.gate;
  if (gate !== undefined) operator.use('*', (c: Context<Env>, next) => Promise.resolve(gate(c, next)));
  operator.use('*', async (c, next) => {
    const presented = c.req.header('x-operator-key') ?? '';
    if (opts.key === '' || !secretsEqual(presented, opts.key)) return c.json({ message: 'Not found.' }, 404);
    return next();
  });
};

export const operatorPrefix = (runtime: Pick<NiscRuntime, 'operatorKey' | 'operatorGate'>): Hono<Env> => {
  const operator = new Hono<Env>();
  guardOperator(operator, { key: runtime.operatorKey ?? '', gate: runtime.operatorGate });
  return operator;
};
