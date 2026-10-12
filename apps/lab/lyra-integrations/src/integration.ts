import { Hono } from 'hono';
import { database } from './db';
import type { IntegrationDb } from './db';
import { readIdentity } from './identity';
import type { Identity } from './identity';

export type IntegrationEnv = (name: string) => string;

export type IntegrationStore = IntegrationDb & { table: (name: string) => string };

export type IntegrationContext = {
  id: string;
  identity: (c: { req: { header: (name: string) => string | undefined } }) => Identity | undefined;
  env: IntegrationEnv;
  db: IntegrationStore | undefined;
};

// No `identity`: the host forwards a vendor's call with no principal and no
// assertion. A hook authenticates its caller by the vendor's signature.
export type HookContext = { id: string; env: IntegrationEnv; db: IntegrationStore | undefined };

export type Integration = {
  id: string;
  bundle: () => unknown;
  env?: readonly string[];
  mount: (router: Hono, ctx: IntegrationContext) => void;
  hooks?: (router: Hono, ctx: HookContext) => void;
  sweep?: (ctx: HookContext) => { everyMs: number; run: () => Promise<void> } | undefined;
};

const storeFor = (integration: Integration): IntegrationStore | undefined => {
  const db = database();
  if (db === undefined) return undefined;
  return { query: db.query, table: (name) => `${integration.id}_${name}` };
};

const envFor = (integration: Integration): IntegrationEnv => {
  const declared = new Set(integration.env ?? []);
  return (name) => {
    if (!declared.has(name)) {
      throw new Error(`integration "${integration.id}" read env "${name}" without declaring it — add it to the integration's env list`);
    }
    return process.env[name] ?? '';
  };
};

const SWEEPS: ReturnType<typeof setInterval>[] = [];

export const stopSweeps = (): void => {
  for (const timer of SWEEPS.splice(0)) clearInterval(timer);
};

export const mountIntegration = (app: Hono, integration: Integration): void => {
  const env = envFor(integration);
  const db = storeFor(integration);
  const router = new Hono();

  router.onError((err, c) => c.json({ message: `The ${integration.id} add-on hit a problem: ${err.message}` }, 500));

  // Unauthenticated: the host fetches this at registration, before the
  // deployment's verify key has reached this environment.
  router.get('/bundle', (c) => c.json(integration.bundle() as Record<string, unknown>));

  // Hooks first, on their own router, so a `/hook/...` route from `mount`
  // cannot shadow the unauthenticated one or the reverse.
  if (integration.hooks !== undefined) {
    const hooks = new Hono();
    integration.hooks(hooks, { id: integration.id, env, db });
    router.route('/hook', hooks);
  }

  integration.mount(router, { id: integration.id, identity: (c) => readIdentity(c, integration.id), env, db });

  const sweep = integration.sweep?.({ id: integration.id, env, db });
  if (sweep !== undefined) {
    const timer = setInterval(() => {
      void sweep.run().catch((err: unknown) => {
        console.warn(`[${integration.id}] sweep failed: ${String(err).slice(0, 200)}`);
      });
    }, sweep.everyMs);
    timer.unref?.();
    SWEEPS.push(timer);
  }

  app.route(`/${integration.id}`, router);
};
