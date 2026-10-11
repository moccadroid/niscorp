import { Hono } from 'hono';
import type { Context, Env } from 'hono';
import { vex } from '@niscorp/vex/hono';
import type { ExecuteRecord, MutationClient, QueryEngine, ScopePolicy } from '@niscorp/vex';
import { writeRequestOf } from './writes';
import type { WriteNotifier } from './writes';

// ═══════════════════════════════════════════════════════════════
// THE VEX SURFACES — where a request reads and writes.
//
//   /api/vex              the cross-resource base surface
//   /api/<resource>/vex   one for each resource the app declares, over its
//                         entities only
//
// The adapter does the work. Locked always: only a seeded entry is replayed,
// never a query a caller authored. WHO the request is comes from the caller of
// this module, for each request and never from the request: the scope values
// that fill a `to:` in a behavior, and the compiled policy.
// ═══════════════════════════════════════════════════════════════

export type VexRoutesConfig<E extends Env> = {
  engine: QueryEngine;
  // The client a write is replayed on.
  db: MutationClient;
  // The app's resources (`NiscApp.resources`): a name, and the entities its
  // surface serves.
  resources?: Readonly<Record<string, readonly string[] | { entities: readonly string[] }>>;
  // The scope values this request carries. Asked per request, so a value
  // derived from today's date cannot be held for the life of a session that
  // began yesterday.
  scope: (c: Context<E>) => Record<string, unknown>;
  // The policy this request reads and writes under, and the same caller at a
  // reach an entry demands: an entry that names a reach is served at it, not
  // at the caller's own.
  policy: (c: Context<E>) => ScopePolicy;
  policyAtReach: (c: Context<E>, reach: string) => ScopePolicy;
  // One record per read and write on these surfaces: the busiest emission
  // point, and the reason vex has an observer at all.
  onExecute?: (record: ExecuteRecord) => void;
  // Where a committed write is reported, and how a request is run with what
  // it said kept for whoever hears a write it makes (./writes.ts).
  writes: Pick<WriteNotifier, 'within' | 'report'>;
};

// A sub-app, for the server to mount at its root behind the authentication
// every route gets. It holds the paths: a shell's wire and the client both
// tell a vex surface by where it is.
export const createVexRoutes = <E extends Env>(config: VexRoutesConfig<E>): Hono<E> => {
  const routes = new Hono<E>();

  // WHAT THE REQUEST SAID RIDES WITH IT, for whoever hears a write it makes:
  // its headers, asked by name, without the credential it carried. No header
  // is read here and none is known by name. This used to read two of a
  // feature's own (`x-tide-cause`, `x-tide-depth`) and hand on what it made of
  // them; the feature that mints a write into tide reads them itself now.
  routes.use('/api/*', (c, next) =>
    config.writes.within(
      writeRequestOf((name) => c.req.header(name)),
      () => next(),
    ),
  );

  const mount = (path: string, entities?: readonly string[]): void => {
    routes.route(
      path,
      vex<E>({
        engine: config.engine,
        ...(entities !== undefined ? { entities: [...entities] } : {}),
        locked: true,
        getScope: config.scope,
        getPolicy: config.policy,
        getPolicyForReach: config.policyAtReach,
        ...(config.onExecute !== undefined ? { onExecute: config.onExecute } : {}),
        // Vex's write observer, fired once per committed mutation with
        // per-statement writes: handed on to the lane, whoever listens there.
        mutations: { client: config.db, onWrite: config.writes.report },
      }),
    );
  };
  mount('/api/vex');
  for (const [name, resource] of Object.entries(config.resources ?? {})) {
    mount(`/api/${name}/vex`, 'entities' in resource ? resource.entities : resource);
  }
  return routes;
};
