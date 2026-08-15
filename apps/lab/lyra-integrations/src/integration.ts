import { Hono } from 'hono';
import { database } from './db';
import type { IntegrationDb } from './db';
import { readIdentity } from './identity';
import type { Identity } from './identity';

// ═══════════════════════════════════════════════════════════════
// THE INTEGRATION CONTRACT — what one integration is, in one process.
//
// This service used to be a single Hono app with literal per-prefix routes:
// `app.post('/belts/roster')` nine times, `identity(c, 'belts')` nine times, one
// module-level array of state, one env var. That shape has exactly one bug in
// it, and it is the same bug every time — a call site that says the wrong name,
// or forgets, and reads somebody else's identity or somebody else's rows.
//
// So an integration no longer names itself at every call site. It is MOUNTED,
// once, and everything that could have been misspelled is derived from the
// mounting:
//
//   THE AUDIENCE IS THE INTEGRATION ID. `ctx.identity(c)` already knows which
//   integration it is asking for, so a token minted for another one cannot be
//   read here even by a handler that never thought about it.
//
//   ROUTES ARE RELATIVE. An integration mounts `/roster`, never
//   `/belts/roster`. The prefix is applied once, here, so an integration cannot
//   serve itself at somebody else's address.
//
//   ENV IS DECLARED AND FENCED. An integration asks for names; asking for one it
//   did not declare throws rather than answering. `STRIPE_SECRET` is unreachable
//   from an integration that never named it — not by convention, by the accessor.
//
//   HOOKS ARE A DIFFERENT ROUTER, and are handed a context with NO identity
//   function at all. The host mints no assertion on that path, so identity is
//   not merely absent there — it is untypeable, and a hook handler cannot
//   accidentally believe it has a caller.
//
// An integration owns its own storage and imports no other integration. Nothing
// enforces the second in TypeScript, so a check does (separation-check).
// ═══════════════════════════════════════════════════════════════

/** Read the deployment's env — but only the names this integration declared. */
export type IntegrationEnv = (name: string) => string;

/**
 * This service's database, or nothing when none is configured.
 *
 * ONE DATABASE, ONE TABLE PREFIX PER INTEGRATION. `table('accounts')` in the stripe
 * integration is `stripe_accounts`, and there is no way to spell it otherwise from
 * here — which is the point, because prefixes are the whole boundary between
 * two integrations' data and a convention would not keep one.
 */
export type IntegrationStore = IntegrationDb & { table: (name: string) => string };

/** What an integration's authenticated routes are handed. */
export type IntegrationContext = {
  id: string;
  /** The caller, verified — with this integration's own id as the audience. */
  identity: (c: { req: { header: (name: string) => string | undefined } }) => Identity | undefined;
  env: IntegrationEnv;
  /** Undefined with no DATABASE_URL — an integration that needs one says so at boot. */
  db: IntegrationStore | undefined;
};

/**
 * What an integration's HOOK routes are handed. Deliberately WITHOUT `identity`: the
 * host forwards a vendor's call with no principal and no assertion, so there is
 * nobody to be. A hook authenticates its caller against the vendor's signature,
 * using a secret from `env`, or it refuses.
 */
export type HookContext = { id: string; env: IntegrationEnv; db: IntegrationStore | undefined };

export type Integration = {
  /** The URL prefix AND the assertion audience. One string, both jobs. */
  id: string;
  /** Served at `GET /<id>/bundle`. Open, because the host fetches it before any key exists. */
  bundle: () => unknown;
  /** Environment names this integration may read. Anything else throws. */
  env?: readonly string[];
  /** Authenticated routes, mounted under `/<id>/`. */
  mount: (router: Hono, ctx: IntegrationContext) => void;
  /** Unauthenticated vendor callbacks, mounted under `/<id>/hook/`. */
  hooks?: (router: Hono, ctx: HookContext) => void;
  /**
   * WORK NOBODY ASKED FOR, on a clock.
   *
   * The host cannot call in — the proxy is person-driven and inbound-only — so
   * an integration that has to act on something lyra decided has no event to
   * wait for. Payments needs exactly one such thing: a membership given notice
   * has a leaving date, and a provider has to be told to stop on it.
   *
   * OPT-IN BY RETURNING SOMETHING. A check boots this service in-process dozens
   * of times; an interval that started itself would fire across a suite and make
   * it order-dependent. So an integration reads its own env and returns nothing
   * when it is not configured to sweep — and the sweep stays callable directly,
   * which is how a check exercises it without a timer at all.
   */
  sweep?: (ctx: HookContext) => { everyMs: number; run: () => Promise<void> } | undefined;
};

// The prefix is APPLIED here, not asked for. An integration names 'accounts' and gets
// 'stripe_accounts'; it cannot name another integration's table without writing the
// prefix out by hand, which is exactly what integration-check looks for.
const storeFor = (integration: Integration): IntegrationStore | undefined => {
  const db = database();
  if (db === undefined) return undefined;
  return { query: db.query, table: (name) => `${integration.id}_${name}` };
};

const envFor = (integration: Integration): IntegrationEnv => {
  const declared = new Set(integration.env ?? []);
  return (name) => {
    // A typo here is an integration silently behaving as if a secret were unset, which
    // looks like a configuration problem for as long as anybody is willing to
    // look. It is a programming error, so it reads like one.
    if (!declared.has(name)) {
      throw new Error(`integration "${integration.id}" read env "${name}" without declaring it — add it to the integration's env list`);
    }
    return process.env[name] ?? '';
  };
};

// Held so a deployment shutting down — or a check that mounted a sweeping
// integration — can stop them. Nothing else reads this.
const SWEEPS: ReturnType<typeof setInterval>[] = [];

export const stopSweeps = (): void => {
  for (const timer of SWEEPS.splice(0)) clearInterval(timer);
};

export const mountIntegration = (app: Hono, integration: Integration): void => {
  const env = envFor(integration);
  const db = storeFor(integration);
  const router = new Hono();

  // A THROW ANSWERS IN SENTENCES. The contract requires an integration's error
  // responses to carry a `message` — the host's screens print it, and its
  // fallback is a bare status code a studio owner cannot act on. Wrapped
  // here, once, so an integration cannot forget: the throw's own words go out,
  // stamped with who is speaking.
  router.onError((err, c) => c.json({ message: `The ${integration.id} add-on hit a problem: ${err.message}` }, 500));

  // OPEN, and it has to be: the host fetches this at registration, before the
  // deployment's verify key has ever reached this environment.
  router.get('/bundle', (c) => c.json(integration.bundle() as Record<string, unknown>));

  // Hooks FIRST, on their own router, so an integration's own `/hook/...` route cannot
  // shadow the unauthenticated one or vice versa.
  if (integration.hooks !== undefined) {
    const hooks = new Hono();
    integration.hooks(hooks, { id: integration.id, env, db });
    router.route('/hook', hooks);
  }

  integration.mount(router, { id: integration.id, identity: (c) => readIdentity(c, integration.id), env, db });

  // UNREF'D, so a sweep never holds the process open. A service whose only
  // remaining work is a timer should be allowed to exit, and a check that forgot
  // to stop one should not hang a suite.
  const sweep = integration.sweep?.({ id: integration.id, env, db });
  if (sweep !== undefined) {
    const timer = setInterval(() => {
      void sweep.run().catch((err: unknown) => {
        // Nothing above this catches, and a rejection here would be an unhandled
        // one that takes the process down — over work that will simply run again
        // in a minute.
        console.warn(`[${integration.id}] sweep failed: ${String(err).slice(0, 200)}`);
      });
    }, sweep.everyMs);
    timer.unref?.();
    SWEEPS.push(timer);
  }

  app.route(`/${integration.id}`, router);
};
