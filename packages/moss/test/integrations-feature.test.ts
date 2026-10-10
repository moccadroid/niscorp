import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { ActionDefinition, FetchFn } from '@niscorp/nova';
import type { PgPool } from '@niscorp/vex';
import { createGrammarUpgrader } from '../src/data/grammar';
import type { CredentialAnswer, FeatureEnv, FeatureSeams, Whoever } from '../src/feature';
import { createIntegrations, integrationOfAction } from '../src/integrations';
import { hashIntegrationKey } from '../src/integrations/credentials';

// THE FEATURE, STARTED BY HAND: `createIntegrations` handed seams that are
// plain functions over a map, the way a server hands it the real ones. No
// database and no server. It holds two things: that everything the feature
// adds to an app it adds through the seams, and that the calls an app makes on
// the object work once it has been started and say so before.

type Row = Record<string, unknown>;

// A pool that answers the feature's statements from maps: which rows a
// statement reads is told by the one clause that names it.
const poolOver = (held: { keys?: Record<string, string>; stored?: Row[]; attached?: Row[]; found?: Record<string, Row> }): PgPool => ({
  query: async (text, values = []) => {
    if (text.includes('WHERE key_hash = $1')) {
      const id = Object.entries(held.keys ?? {}).find(([key]) => hashIntegrationKey(key) === values[0])?.[1];
      return { rows: id === undefined ? [] : [{ id }] };
    }
    if (text.includes('a.definition')) return { rows: held.stored ?? [] };
    if (text.includes('a.attach_to = $1')) return { rows: (held.attached ?? []).filter((row) => row['attach_to'] === values[0]) };
    if (text.includes('SELECT url, status, reach, frames')) return { rows: [held.found?.[String(values[0])]].filter((row) => row !== undefined) };
    return { rows: [] };
  },
});

const desk: ActionDefinition = { id: 'ext.desk.belts.roster' };

const world = async (over: { pool?: PgPool; who?: (principal: string | null) => Whoever } = {}) => {
  const said = {
    credentials: new Map<string, (token: string, request: Request) => Promise<CredentialAnswer>>(),
    narrowings: [] as Parameters<FeatureSeams['narrowCatalogs']>[0][],
    loaders: new Map<string, () => Promise<Record<string, ActionDefinition>>>(),
    wraps: [] as ((inner: FetchFn) => FetchFn)[],
    replaced: [] as [string, Record<string, ActionDefinition>][],
  };
  // The server's side of the two mounts: every route behind a line that says
  // who is calling, as the server's authentication would have.
  const caller: { principal: string | null } = { principal: null };
  const server = new Hono<FeatureEnv>();
  server.use('*', async (c, next) => {
    c.set('principal', caller.principal);
    return next();
  });
  const operator = new Hono<FeatureEnv>();
  const seams: FeatureSeams = {
    routes: (routes) => {
      server.route('/', routes);
    },
    operatorRoutes: (routes) => {
      operator.route('/', routes);
    },
    credential: (prefix, principalOf) => {
      said.credentials.set(prefix, principalOf);
    },
    who: async (principal) => over.who?.(principal) ?? { roles: ['public'], installed: undefined },
    scopeOf: async (principal) => ({ userId: principal }),
    holds: () => [],
    actions: () => ({}),
    replaceActions: (source, actions) => {
      said.replaced.push([source, actions]);
    },
    refusalOf: () => undefined,
    loadActionsFrom: (source, load) => {
      said.loaders.set(source, load);
    },
    narrowCatalogs: (filter) => {
      said.narrowings.push(filter);
    },
    charter: { desk: { actions: ['desk.*', 'ext.desk.*'] }, member: { actions: { allow: ['ext.member.*'] } } },
    components: { Text: {} },
    pool: over.pool ?? poolOver({}),
    ownEntries: async () => async () => undefined,
    grammars: await createGrammarUpgrader({}),
    fingerprints: async () => ['deals/open'],
    fingerprintsFor: async () => ['deals/open'],
    telemetry: undefined,
    signingSeed: undefined,
    wrapWire: (wrap) => {
      said.wraps.push(wrap);
    },
  };
  return { seams, said, server, operator, caller };
};

describe('createIntegrations — before a server has started it', () => {
  it('every call that needs the server says so in a sentence, and the one that needs nothing answers', async () => {
    const integrations = createIntegrations({ attachable: { 'people.detail': {} } });
    const sentence = /^moss: integrations\.\w+ was called before a server started the feature\. Put what createIntegrations returned in the manifest's `features`/;
    await expect(integrations.listAttachments('people.detail')).rejects.toThrow(sentence);
    await expect(integrations.listPlacements()).rejects.toThrow(sentence);
    await expect(integrations.integrationByKey('ik_anything')).rejects.toThrow(sentence);
    await expect(integrations.callIntegration('belts', 'sync', { principal: 'i_mara' })).rejects.toThrow(/integrations\.callIntegration was called before/);
    expect(integrations.integrationOfAction('ext.desk.belts.roster')).toBe('belts');
    expect(integrationOfAction('people.detail')).toBeUndefined();
  });

  it('is what a manifest holds in `features`: a name, and a function to start it with', () => {
    const integrations = createIntegrations();
    expect(integrations.name).toBe('integrations');
    expect(typeof integrations.start).toBe('function');
  });
});

describe('createIntegrations — started with the seams', () => {
  it('adds itself through them: a credential, a rule for what is installed, a set in rows, a wrap, and its routes', async () => {
    const { seams, said, server, operator } = await world();
    await createIntegrations().start(seams);

    expect([...said.credentials.keys()]).toEqual(['ik_']);
    expect([...said.loaders.keys()]).toEqual(['integrations']);
    expect(said.wraps).toHaveLength(1);
    // The rule: an integration's action is there only where it is installed,
    // and an action that is nobody's is always there.
    const [installedOnly] = said.narrowings;
    expect(said.narrowings).toHaveLength(1);
    expect(installedOnly?.(['home', 'ext.desk.belts.roster', 'ext.desk.pay.checkout'], new Set(['belts']))).toEqual(['home', 'ext.desk.belts.roster']);
    expect(installedOnly?.(['home', 'ext.desk.belts.roster'], undefined)).toEqual(['home', 'ext.desk.belts.roster']);

    expect(server.routes.map((route) => `${route.method} ${route.path}`).filter((route) => !route.startsWith('ALL /*'))).toEqual([
      'GET /api/integrations/contract',
      'GET /api/integrations/verify-key',
      'POST /api/integrations/frame',
      'GET /integrations/:id/frame/:token',
      'POST /integrations/:id/frame/:token/:call',
      // The webhook before the proxy, whose pattern would take it.
      'POST /integrations/:id/hook/*',
      'ALL /integrations/:id/*',
    ]);
    expect(operator.routes.map((route) => `${route.method} ${route.path}`)).toEqual([
      'GET /integrations',
      'POST /integrations',
      'POST /integrations/:id/approve',
      'DELETE /integrations/:id',
      'POST /integrations/:id/probe',
    ]);
  });

  it('hands over what was approved before this process started, and nothing when nothing was', async () => {
    const empty = await world();
    await createIntegrations().start(empty.seams);
    expect(empty.said.replaced).toEqual([]);

    const approved = await world({ pool: poolOver({ stored: [{ action_id: desk.id, definition: desk, grammar: {} }] }) });
    await createIntegrations().start(approved.seams);
    expect(approved.said.replaced).toEqual([['integrations', { [desk.id]: desk }]]);
    // ...and the loader it named reads the same rows again.
    expect(await approved.said.loaders.get('integrations')?.()).toEqual({ [desk.id]: desk });
  });

  it('a stored definition nova does not read is left out, and the rest is served', async () => {
    const { seams, said } = await world({
      pool: poolOver({
        stored: [
          { action_id: desk.id, definition: desk, grammar: {} },
          { action_id: 'ext.desk.belts.broken', definition: { id: 'ext.desk.belts.broken', tittle: 'A typo' }, grammar: {} },
        ],
      }),
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await createIntegrations().start(seams);
      expect(said.replaced).toEqual([['integrations', { [desk.id]: desk }]]);
      // With a line that names it, as one in a newer grammar gets.
      expect(logged.mock.calls.map(([line]) => String(line))).toEqual([expect.stringMatching(/^\[moss\] integration action "ext\.desk\.belts\.broken" is not served: it is not an action nova reads/)]);
    } finally {
      logged.mockRestore();
    }
  });

  it('the calls work from then on, against the pool the server handed over', async () => {
    const { seams } = await world({
      pool: poolOver({
        keys: { ik_belts: 'belts' },
        attached: [
          { action_id: 'ext.desk.belts.panel', preview: '/integrations/belts/preview', attach_to: 'people.detail' },
          { action_id: 'ext.desk.pay.panel', preview: null, attach_to: 'somewhere.else' },
        ],
      }),
    });
    const integrations = createIntegrations();
    await integrations.start(seams);

    expect(await integrations.listAttachments('people.detail')).toEqual([{ actionId: 'ext.desk.belts.panel', preview: '/integrations/belts/preview' }]);
    expect(await integrations.listPlacements()).toEqual({});
    expect(await integrations.integrationByKey('ik_belts')).toBe('belts');
    expect(await integrations.integrationByKey('ik_nobody')).toBeUndefined();
    await expect(integrations.callIntegration('ghost', 'sync', { principal: 'i_mara' })).rejects.toThrow('moss: callIntegration("ghost"): no such integration.');
  });
});

describe('the integration key, as the credential the feature registers', () => {
  const keyed = async (config: Parameters<typeof createIntegrations>[0], who?: (principal: string | null) => Whoever) => {
    const { seams, said } = await world({ pool: poolOver({ keys: { ik_belts: 'belts' } }), ...(who === undefined ? {} : { who }) });
    await createIntegrations(config).start(seams);
    const principalOf = said.credentials.get('ik_');
    if (principalOf === undefined) throw new Error('no credential was registered');
    return (key: string, actsFor?: string): Promise<CredentialAnswer> =>
      principalOf(key, new Request('http://moss.test/api/vex', actsFor === undefined ? {} : { headers: { 'x-nisc-acts-for': actsFor } }));
  };
  const actor = (integration: string, actsFor: string): string | null => (actsFor === '' ? null : `ig_${integration}@${actsFor}`);
  const noActor = { refused: { status: 403, error: 'no_actor', message: 'This integration has no actor there.' } };

  it('a key that resolves to no approved integration is refused as a key', async () => {
    const read = await keyed({ integrationActor: actor });
    expect(await read('ik_nobody', 's_1')).toEqual({ refused: { status: 401, error: 'invalid_key', message: 'The integration key did not resolve.' } });
  });

  it('an app that names no actor, or names none there, is a 403', async () => {
    expect(await (await keyed({}))('ik_belts', 's_1')).toEqual(noActor);
    expect(await (await keyed({ integrationActor: actor }))('ik_belts')).toEqual(noActor);
  });

  it('an actor who is nobody to the app is refused; one the app knows is that principal', async () => {
    const unknown = await keyed({ integrationActor: actor }, () => ({ roles: ['public'], installed: undefined }));
    expect(await unknown('ik_belts', 's_1')).toEqual(noActor);

    const known = await keyed({ integrationActor: actor }, (principal) => ({ roles: principal === 'ig_belts@s_1' ? ['integration'] : ['public'], installed: ['belts'] }));
    expect(await known('ik_belts', 's_1')).toEqual({ principal: 'ig_belts@s_1' });
  });
});

describe('the routes the feature mounts, asked through the server it mounted them on', () => {
  it('serves the verify key and the contract, made of what the app said and what the server knows', async () => {
    const { seams, server } = await world();
    await createIntegrations({ attachable: { 'people.detail': { person_id: 'personId' } }, menuSlots: ['hub.people'] }).start(seams);

    const key = (await (await server.request('/api/integrations/verify-key')).json()) as { alg: string; key: string };
    expect(key.alg).toBe('ed25519');
    expect(key.key.length).toBeGreaterThan(20);

    const contract = (await (await server.request('/api/integrations/contract?id=belts')).json()) as Record<string, unknown>;
    expect(contract).toMatchObject({
      namespace: 'ext.<audience>.belts.<name>',
      // Every audience the charter drew an `ext.` fence for.
      audiences: ['desk', 'member'],
      components: [{ name: 'Text', description: '' }],
      // The offered keys, never the host's paths.
      attachable: { 'people.detail': ['person_id'] },
      menuSlots: ['hub.people'],
      fingerprints: ['deals/open'],
      verifyKey: key.key,
    });
  });

  it('an operator’s body that is not an object, or not JSON, reads as an empty one', async () => {
    const { seams, operator } = await world();
    await createIntegrations().start(seams);
    for (const body of ['null', '"belts"', '[1]', 'not json', '{"id":7,"url":"https://belts.example"}']) {
      const answered = await operator.request('/integrations', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
      expect(answered.status).toBe(400);
      expect(await answered.json()).toEqual({ message: 'Give an id and a url.' });
    }
    // The probe's body names a path or nothing: for an integration that is not
    // there it is not read at all.
    expect((await operator.request('/integrations/belts/probe', { method: 'POST', body: 'null' })).status).toBe(404);
  });

  it('the proxy asks for a principal; the webhook asks for none, and answers nothing for an integration that is not there', async () => {
    const { seams, server, caller } = await world();
    await createIntegrations().start(seams);

    expect((await server.request('/integrations/belts/roster')).status).toBe(401);
    expect((await server.request('/integrations/belts/hook/stripe', { method: 'POST', body: '{}' })).status).toBe(404);
    caller.principal = 'i_mara';
    const refused = await server.request('/integrations/belts/roster');
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ message: 'No such integration.' });
  });

  it('forwards for an approved integration only what the caller’s own screens declare', async () => {
    const sent: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      sent.push(String(url));
      return new Response('{"rows":[]}', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    try {
      const found = { url: 'https://belts.example', status: 'approved', reach: { '/integrations/belts/roster': ['ext.desk.belts.roster'] }, frames: {} };
      const { seams, server, caller } = await world({ pool: poolOver({ found: { belts: found } }), who: () => ({ roles: ['desk'], installed: ['belts'] }) });
      await createIntegrations().start({ ...seams, holds: (roles) => (roles.includes('desk') ? ['ext.desk.belts.roster'] : []) });
      caller.principal = 'i_mara';

      expect((await server.request('/integrations/belts/roster?view=summary')).status).toBe(200);
      expect((await server.request('/integrations/belts/admin')).status).toBe(404);
      expect(sent).toEqual(['https://belts.example/roster?view=summary']);
    } finally {
      globalThis.fetch = real;
    }
  });
});
