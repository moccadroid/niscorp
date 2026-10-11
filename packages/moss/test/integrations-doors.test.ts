import { describe, it, expect, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import { createGrammarUpgrader } from '../src/data/grammar';
import type { FeatureEnv, Replay } from '../src/feature';
import { BundleSchema } from '../src/integrations/bundle';
import { createForwarder } from '../src/integrations/forward';
import { frameRoutes } from '../src/integrations/frame';
import { operatorRoutes } from '../src/integrations/operator';
import type { OperatorDeps } from '../src/integrations/operator';
import { proxyRoutes } from '../src/integrations/proxy';
import { reachOf } from '../src/integrations/reach';

// THE DOORS OF THE INTEGRATIONS FEATURE, each asked what it refuses: the frame
// door, the operator's routes and the proxy, mounted over a registry that is a
// map and a service that is a function. No database, and nothing leaves the
// process.

type Row = Record<string, unknown>;
const json = { 'content-type': 'application/json' };

// A service that answers what a test says, and keeps what it was asked.
const serviceAnswering = (answer: (url: string) => Response = () => new Response('<html>the page</html>', { status: 200, headers: { 'content-type': 'text/html' } })) => {
  const asked: { url: string; method: string }[] = [];
  const fetchIt = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    asked.push({ url: String(input), method: init?.method ?? 'GET' });
    return answer(String(input));
  };
  return { asked, fetch: fetchIt };
};

// ═══════════════════════════════════════════════════════════════
// THE FRAME DOOR
// ═══════════════════════════════════════════════════════════════

describe('the frame door', () => {
  const PAGE = '/integrations/belts/embed/pay';
  // `belts` is approved and declares one framed page; `pay` is approved and
  // declares none; `draft` declares one and nobody approved it.
  const registered: Record<string, Row> = {
    belts: { url: 'https://belts.example', status: 'approved', reach: {}, frames: { [PAGE]: 'ext.desk.belts.pay' } },
    pay: { url: 'https://pay.example', status: 'approved', reach: {}, frames: {} },
    draft: { url: 'https://draft.example', status: 'pending', reach: {}, frames: { '/integrations/draft/embed/pay': 'ext.desk.draft.pay' } },
  };

  // The door, for whoever `caller.principal` says is signed in. `installed` is
  // what is live for their tenant, and the test's to change.
  const door = () => {
    const grants = new Map<string, Row>();
    const caller: { principal: string | null } = { principal: 'i_mara' };
    const tenant: { installed: readonly string[] | undefined } = { installed: ['belts', 'pay', 'draft'] };
    const service = serviceAnswering();
    const replay: Replay = async (fingerprint, context) => {
      if (fingerprint === 'integrations/find') return [registered[String(context['id'])]].filter((row) => row !== undefined);
      if (fingerprint === 'integrations/keep-frame-grant') {
        grants.set(String(context['grant_hash']), { integration_id: context['integration_id'], principal: context['principal'], path: context['path'] });
        return [];
      }
      if (fingerprint === 'integrations/frame-grant') {
        const row = grants.get(String(context['grant_hash']));
        return row !== undefined && row['integration_id'] === context['integration_id'] ? [row] : [];
      }
      return [];
    };
    const resolveIdentity = async (): Promise<{ roles: readonly string[]; installed: readonly string[] | undefined }> => ({ roles: ['desk'], installed: tenant.installed });
    const routes = frameRoutes({
      replay,
      resolveIdentity,
      grantedActionIds: () => ['ext.desk.belts.pay', 'ext.desk.draft.pay'],
      forward: createForwarder({
        find: async (id) => z.object({ url: z.string(), status: z.string(), reach: z.record(z.string(), z.array(z.string())), frames: z.record(z.string(), z.string()) }).optional().parse(registered[id]),
        resolveIdentity,
        scopeOf: async () => ({}),
        mint: () => 'an-assertion',
        timeoutMs: 30_000,
        fetch: service.fetch,
      }),
    });
    const server = new Hono<FeatureEnv>();
    server.use('*', async (c, next) => {
      c.set('principal', caller.principal);
      return next();
    });
    server.route('/', routes);
    const askFor = (path: string): Promise<Response> => Promise.resolve(server.request('/api/integrations/frame', { method: 'POST', headers: json, body: JSON.stringify({ path }) }));
    const granted = async (): Promise<string> => z.object({ src: z.string() }).parse(await (await askFor(PAGE)).json()).src;
    return { server, caller, tenant, grants, asked: service.asked, askFor, granted };
  };

  it('mints for nobody who is not signed in', async () => {
    const { caller, askFor, grants } = door();
    caller.principal = null;
    const refused = await askFor(PAGE);
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ message: 'Sign in first.' });
    expect(grants.size).toBe(0);
  });

  it('mints for no integration that is not approved, and says no more of one that is pending than of one that is not there', async () => {
    const { askFor, grants } = door();
    const pending = await askFor('/integrations/draft/embed/pay');
    const unknown = await askFor('/integrations/ghost/embed/pay');
    expect([pending.status, unknown.status]).toEqual([404, 404]);
    expect(await pending.json()).toEqual(await unknown.json());
    expect(grants.size).toBe(0);
  });

  it('mints for no integration that is not installed for the caller’s tenant', async () => {
    const { tenant, askFor, grants } = door();
    tenant.installed = ['pay'];
    const refused = await askFor(PAGE);
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ message: 'Not installed here.' });
    expect(grants.size).toBe(0);
    // A deployment that keeps no install list has every integration live.
    tenant.installed = undefined;
    expect((await askFor(PAGE)).status).toBe(200);
  });

  // Checked again when the grant is spent, not only when it was minted: an
  // uninstall between the two is the moment a tab that is still open stops.
  it('a grant is asked about again when it is spent: uninstalled since, it opens nothing and the integration is not called', async () => {
    const { server, tenant, asked, granted } = door();
    const src = await granted();
    expect((await server.request(src)).status).toBe(200);
    expect(asked).toEqual([{ url: 'https://belts.example/embed/pay', method: 'GET' }]);

    tenant.installed = ['pay'];
    const stale = await server.request(src);
    expect(stale.status).toBe(404);
    expect(await stale.json()).toEqual({ message: 'Not found.' });
    expect(asked).toHaveLength(1);
  });

  it('a grant opens its own integration’s page: at another approved integration’s address it opens nothing, and that one is not called', async () => {
    const { server, asked, granted } = door();
    const src = await granted();
    const elsewhere = await server.request(src.replace('/integrations/belts/', '/integrations/pay/'));
    expect(elsewhere.status).toBe(404);
    expect(asked).toEqual([]);
  });

  // A framed page may call back on its grant, BESIDE itself and nowhere else:
  // one segment, in the directory the page is in. No dots, no slashes, no
  // capitals: nothing that could name a file, a parent or a deeper path.
  it('a page’s call back goes to a sibling of the page: one plain segment, in its own directory', async () => {
    const { server, asked, granted } = door();
    const src = await granted();
    const called = await server.request(`${src}/session`, { method: 'POST', body: '{"n":1}' });
    expect(called.status).toBe(200);
    expect(asked).toEqual([{ url: 'https://belts.example/embed/session', method: 'POST' }]);

    for (const call of ['admin.php', 'deeper%2Fpath', 'Session', '-flag', '.env']) {
      const refused = await server.request(`${src}/${call}`, { method: 'POST', body: '{}' });
      expect([call, refused.status]).toEqual([call, 404]);
    }
    expect(asked).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// THE OPERATOR'S ROUTES
// ═══════════════════════════════════════════════════════════════

describe('the operator’s routes', () => {
  const roster = { id: 'ext.desk.belts.roster' };
  const bundle = { integration: 'belts', meta: { title: 'Belts' }, actions: { [roster.id]: roster } };
  const real = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = real;
  });

  // The routes over a registry that keeps how `belts` stands and every entry
  // that was replayed; the service answers what the test says.
  const routes = async (over: Partial<OperatorDeps> & { registration?: Row; found?: Row; service?: (url: string) => Response } = {}) => {
    const replayed: { fingerprint: string; context: Record<string, unknown> }[] = [];
    const reloads = { count: 0 };
    const service = serviceAnswering(over.service ?? (() => new Response(JSON.stringify(bundle), { status: 200, headers: json })));
    globalThis.fetch = service.fetch;
    const replay: Replay = async (fingerprint, context) => {
      replayed.push({ fingerprint, context });
      if (fingerprint === 'integrations/registration') return over.registration === undefined ? [] : [over.registration];
      if (fingerprint === 'integrations/find') return over.found === undefined ? [] : [over.found];
      return [];
    };
    const operator = operatorRoutes({
      replay,
      grammars: await createGrammarUpgrader({}),
      fingerprints: async () => [],
      vocabulary: { layoutMisfits: () => [], endlessChains: () => [], attachable: undefined, menuSlots: undefined, assistantTools: undefined, publishChecks: undefined, editorRegions: undefined },
      actions: () => ({}),
      refusalOf: () => undefined,
      reload: async () => void (reloads.count += 1),
      placementNames: {},
      storePress: undefined,
      timeoutMs: 30_000,
      pressMaxBytes: 1024,
      ...over,
    });
    const register = (): Promise<Response> => Promise.resolve(operator.request('/integrations', { method: 'POST', headers: json, body: JSON.stringify({ id: 'belts', url: 'https://belts.example' }) }));
    const written = (): string[] => replayed.map((entry) => entry.fingerprint).filter((fingerprint) => fingerprint !== 'integrations/registration' && fingerprint !== 'integrations/find');
    return { operator, register, replayed, written, reloads, asked: service.asked };
  };

  // A bundle that parses is one the service meant to send. An error page that
  // happens to be JSON is not: the status is read before the body.
  it('a service that answers its bundle’s address with an error has not answered with a bundle, whatever the body says', async () => {
    const { register, written } = await routes({ service: () => new Response(JSON.stringify(bundle), { status: 500, headers: json }) });
    const answered = await register();
    expect(answered.status).toBe(502);
    expect(await answered.json()).toEqual({ message: 'The integration did not answer with a bundle.' });
    expect(written()).toEqual(['integrations/record-failed-import']);
  });

  it('an import that is refused is kept as what the operator sees of it: the address tried, and why', async () => {
    const { register, replayed } = await routes({ service: () => new Response('not a bundle at all', { status: 200 }) });
    expect((await register()).status).toBe(502);
    expect(replayed.filter((entry) => entry.fingerprint === 'integrations/record-failed-import').map((entry) => entry.context)).toEqual([
      { id: 'belts', url: 'https://belts.example', last_error: 'the service did not answer with a bundle' },
    ]);
  });

  // An integration that is already approved is being served. Its next import
  // lands in rows the app serves from at once, so it is verified first, as an
  // approval is: one the app would not serve is refused and nothing lands.
  it('a new import of an approved integration that the app would not serve is refused before anything is written', async () => {
    const REFUSAL = 'Refresh refused — charter incoherent over the new artifacts:\n  no role grants "ext.desk.belts.roster"';
    const { register, written, reloads } = await routes({ registration: { status: 'approved', key_hash: 'held' }, refusalOf: (actions) => (roster.id in actions ? REFUSAL : undefined) });
    const answered = await register();
    expect(answered.status).toBe(422);
    expect(await answered.json()).toEqual({ message: 'Refused — the app would not serve this.', reasons: [`Error: ${REFUSAL}`] });
    expect(written()).toEqual([]);
    expect(reloads.count).toBe(0);
  });

  it('…and one that is still pending lands unverified: nothing of it is served until it is approved', async () => {
    const { register, written } = await routes({ registration: { status: 'pending', key_hash: 'held' }, refusalOf: () => 'the app would not serve this' });
    const answered = await register();
    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual({ id: 'belts', status: 'pending', actions: 1 });
    expect(written()).toEqual(['integrations/write-bundle']);
  });

  it('removing an integration takes its actions out of what the app serves, there and then', async () => {
    const { operator, written, reloads } = await routes();
    const answered = await operator.request('/integrations/belts', { method: 'DELETE' });
    expect(await answered.json()).toEqual({ id: 'belts', removed: true });
    expect(written()).toEqual(['integrations/remove']);
    expect(reloads.count).toBe(1);
  });

  describe('the probe', () => {
    const found = { url: 'https://belts.example/', status: 'approved', reach: { '/integrations/belts/roster': [roster.id] }, frames: {} };
    const probe = (operator: Hono<FeatureEnv>, path?: string): Promise<Response> =>
      Promise.resolve(operator.request('/integrations/belts/probe', { method: 'POST', headers: json, body: JSON.stringify(path === undefined ? {} : { path }) }));

    // The operator's key is not a way to have this server fetch anything the
    // service serves: the bundle, and the paths the integration declared.
    it('fetches the bundle, or a path the integration declared, and no other path of its service', async () => {
      const { operator, asked } = await routes({ found, service: () => new Response('ok', { status: 200 }) });
      expect(await (await probe(operator)).json()).toMatchObject({ status: 200, body: 'ok' });
      expect(await (await probe(operator, 'roster')).json()).toMatchObject({ status: 200 });
      const undeclared = await probe(operator, 'internal/admin');
      expect(undeclared.status).toBe(404);
      expect(await undeclared.json()).toEqual({ message: 'That path is not one this integration declared.' });
      expect(asked.map((call) => call.url)).toEqual(['https://belts.example/bundle', 'https://belts.example/roster']);
    });

    it('answers the first 2,000 characters of what the service said, however much it said', async () => {
      const { operator } = await routes({ found, service: () => new Response('x'.repeat(5_000), { status: 200 }) });
      const answered = z.object({ body: z.string() }).parse(await (await probe(operator)).json());
      expect(answered.body).toHaveLength(2_000);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// THE PROXY, AND WHAT IT MAY REACH
// ═══════════════════════════════════════════════════════════════

describe('the proxy — a declared path is for whoever holds the action that declared it', () => {
  // Two screens of one integration, each declaring its own endpoint. The
  // union of what a bundle declares is not what one caller may reach.
  const found = { url: 'https://belts.example', status: 'approved', reach: { '/integrations/belts/roster': ['ext.member.belts.card'], '/integrations/belts/payouts': ['ext.desk.belts.payouts'] }, frames: {} };
  const door = (held: readonly string[]) => {
    const service = serviceAnswering(() => new Response('{"rows":[]}', { status: 200, headers: json }));
    const proxied = proxyRoutes({
      grantedActionIds: () => [...held],
      forward: createForwarder({
        find: async (id) => (id === 'belts' ? found : undefined),
        resolveIdentity: async () => ({ roles: ['member'], installed: undefined }),
        scopeOf: async () => ({}),
        mint: () => 'an-assertion',
        timeoutMs: 30_000,
        fetch: service.fetch,
      }),
    });
    const server = new Hono<FeatureEnv>();
    server.use('*', async (c, next) => {
      c.set('principal', 'm_juno');
      return next();
    });
    server.route('/', proxied);
    return { server, asked: service.asked };
  };

  it('a member reaches the endpoint their own screen declares, and not the one the desk’s screen does', async () => {
    const { server, asked } = door(['ext.member.belts.card']);
    expect((await server.request('/integrations/belts/roster')).status).toBe(200);
    const refused = await server.request('/integrations/belts/payouts');
    expect(refused.status).toBe(404);
    expect(asked.map((call) => call.url)).toEqual(['https://belts.example/roster']);
  });
});

describe('reachOf — what a bundle declares is what its own prefix holds', () => {
  // Intake refuses a bundle whose endpoint leaves its prefix. What is kept as
  // reach is read off the bundle again, and holds none of them either: a
  // path of the app's own, or of another integration, admitted nobody.
  it('an endpoint outside the integration’s own prefix is no reach of its', () => {
    const declared = BundleSchema.parse({
      integration: 'belts',
      meta: { title: 'Belts' },
      actions: {
        'ext.desk.belts.roster': {
          id: 'ext.desk.belts.roster',
          endpoints: {
            own: { url: '/integrations/belts/roster?view=summary', method: 'GET' },
            apps: { url: '/api/vex', method: 'POST' },
            anothers: { url: '/integrations/pay/payouts', method: 'GET' },
          },
        },
      },
    });
    expect(reachOf(declared, 'belts')).toEqual({ '/integrations/belts/roster': ['ext.desk.belts.roster'] });
  });
});
