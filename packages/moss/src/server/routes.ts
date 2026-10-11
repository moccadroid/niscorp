import type { Hono } from 'hono';
import type { Data } from '../data';
import type { Identity } from '../identity';
import type { NiscApp, RunningManifest } from '../manifest';
import type { SessionVerifier } from '../runtime';
import { authentication } from './authenticate';
import type { FeatureCredential } from './authenticate';
import type { Env } from './moss-server';

// ═══════════════════════════════════════════════════════════════
// THE SERVER'S OWN SURFACES, mounted in the order a request meets them:
//
//   every route           the authentication (./authenticate.ts)
//   /catalog              the application, resolved for the caller
//   /api/vex              reads and writes, locked, scoped per principal
//   /api/<resource>/vex   one for each resource the app declares
//
// THE ORDER IS THE PROPERTY. Hono composes matched handlers in the order they
// were added, so the authentication is added before any route, and a
// feature's routes — mounted when the feature starts — after these. The
// operator prefix is the last thing mounted (./operator.ts).
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
