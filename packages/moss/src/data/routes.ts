import { Hono } from 'hono';
import type { Context, Env } from 'hono';
import { vex } from '@niscorp/vex/hono';
import type { ExecuteRecord, MutationClient, QueryEngine, ScopePolicy } from '@niscorp/vex';
import type { WriteLane } from './writes';

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
  // Where a committed write is reported, and how a request is run inside the
  // chain position it named (./writes.ts).
  writes: Pick<WriteLane, 'within' | 'report'>;
};

// HOW DEEP IN A CHAIN A REQUEST SAYS IT IS: a whole number that is not
// negative, written as `String(depth)` writes one — digits and nothing else.
// Read by its form and not with `Number()`, which reads more than a number:
// an empty header is 0 to it, and 0 is the start of a chain, so a chain whose
// depth was lost on the way was counted from the beginning again, under a
// ceiling that exists to stop it. Undefined: the header names no depth.
const depthOf = (header: string | undefined): number | undefined => {
  if (header === undefined || !/^\d+$/.test(header)) return undefined;
  const depth = Number(header);
  return Number.isSafeInteger(depth) ? depth : undefined;
};

// A sub-app, for the server to mount at its root behind the authentication
// every route gets. It holds the paths: a shell's wire and the client both
// tell a vex surface by where it is.
export const createVexRoutes = <E extends Env>(config: VexRoutesConfig<E>): Hono<E> => {
  const routes = new Hono<E>();

  // THE CHAIN CHANNEL. A tide effect writing back through vex names its chain
  // position in two headers; they ride the write lane's context so whoever
  // hears the write can read them. Untrusted at this point: the app's
  // `facts.chain` gate decides whether the caller's word is good.
  routes.use('/api/*', async (c, next) => {
    const cause = c.req.header('x-tide-cause');
    const depth = depthOf(c.req.header('x-tide-depth'));
    if (cause === undefined || cause === '' || depth === undefined) return next();
    return config.writes.within({ cause, depth }, () => next());
  });

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
