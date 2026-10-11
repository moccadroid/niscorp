import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ActionDefinition, FetchFn } from '@niscorp/nova';
import type { DocumentStore } from '@niscorp/strata/postgres';
import { createPostgresAdapter } from '@niscorp/vex';
import type { DatabaseSchema, MutationClient } from '@niscorp/vex';
import { createGrammarUpgrader } from '../src/data/grammar';
import { createOwnEntries } from '../src/data/own-entries';
import type { CredentialAnswer, FeatureEnv, FeatureSeams, Replay, PrincipalIdentity } from '../src/feature';
import { endlessChains, layoutMisfits } from '../src/manifest';
import { createIntegrations } from '../src/integrations';
import { integrationOfAction } from '../src/integrations/installed';
import { hashIntegrationKey } from '../src/integrations/credentials';
import { PAGE, REGISTRY_ENTRIES, REGISTRY_TABLES } from '../src/integrations/entries';
import { setBackToPending } from '../src/integrations/registry';
import { neverAnswers } from './never-answers';

// THE FEATURE, STARTED BY HAND: `createIntegrations` handed seams that are
// plain functions over a map, the way a server hands it the real ones. No
// database and no server. It holds two things: that everything the feature
// adds to an app it adds through the seams, and that the calls an app makes on
// the object work once it has been started and say so before.

type Row = Record<string, unknown>;

// What the feature's own entries answer, from maps: which rows a read answers
// is told by its fingerprint and the context it is replayed with. A write
// answers nothing and is not kept.
const replayOver =
  (held: { keys?: Record<string, string>; stored?: Row[]; attached?: Row[]; found?: Record<string, Row> }): Replay =>
  async (fingerprint, context) => {
    if (fingerprint === 'integrations/by-key') {
      const id = Object.entries(held.keys ?? {}).find(([key]) => hashIntegrationKey(key) === context['key_hash'])?.[1];
      return id === undefined ? [] : [{ id }];
    }
    if (fingerprint === 'integrations/stored-actions') return held.stored ?? [];
    if (fingerprint === 'integrations/attachments') return (held.attached ?? []).filter((row) => row['attach_to'] === context['attach_to']);
    if (fingerprint === 'integrations/find') return [held.found?.[String(context['id'])]].filter((row) => row !== undefined);
    return [];
  };

const desk: ActionDefinition = { id: 'ext.desk.belts.roster' };

// `refuses` stands in for the running manifest's verification: the sentence a
// set of actions would be refused with, by `refusalOf` when it is asked and by
// `replaceActions` when the set is handed over.
const world = async (
  over: {
    replay?: Replay;
    who?: (principal: string | null) => PrincipalIdentity;
    refuses?: (actions: Readonly<Record<string, ActionDefinition>>) => string | undefined;
    upgradeStore?: FeatureSeams['upgradeStore'];
  } = {},
) => {
  const said = {
    credentials: new Map<string, (token: string, request: Request) => Promise<CredentialAnswer>>(),
    catalogFilters: [] as Parameters<FeatureSeams['addCatalogFilter']>[0][],
    loaders: [] as (() => Promise<Record<string, ActionDefinition>>)[],
    wraps: [] as ((inner: FetchFn) => FetchFn)[],
    replaced: [] as Record<string, ActionDefinition>[],
    owned: [] as Parameters<FeatureSeams['ownEntries']>[0][],
    // The stores whose documents the feature asked to have brought current,
    // and, in order, that asking and every entry it replayed.
    upgraded: [] as DocumentStore[],
    order: [] as string[],
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
    mountRoutes: (routes) => {
      server.route('/', routes);
    },
    mountOperatorRoutes: (routes) => {
      operator.route('/', routes);
    },
    registerCredential: (prefix, principalOf) => {
      said.credentials.set(prefix, principalOf);
    },
    resolveIdentity: async (principal) => over.who?.(principal) ?? { roles: ['public'], installed: undefined },
    scopeOf: async (principal) => ({ userId: principal }),
    grantedActionIds: () => [],
    actions: () => ({}),
    replaceActions: (actions) => {
      const refusal = over.refuses?.(actions);
      if (refusal !== undefined) throw new Error(refusal);
      said.replaced.push(actions);
    },
    refusalOf: (actions) => over.refuses?.(actions),
    setActionsLoader: (load) => {
      said.loaders.push(load);
    },
    addCatalogFilter: (filter) => {
      said.catalogFilters.push(filter);
    },
    charter: { desk: { actions: ['desk.*', 'ext.desk.*'] }, member: { actions: { allow: ['ext.member.*'] } } },
    components: { Text: {} },
    layoutMisfits: (layout) => layoutMisfits(layout, new Map([['Text', {}]])),
    endlessChains,
    ownEntries: async (own) => {
      said.owned.push(own);
      const replay = over.replay ?? replayOver({});
      return async (fingerprint, context) => {
        said.order.push(fingerprint);
        return replay(fingerprint, context);
      };
    },
    grammars: await createGrammarUpgrader({}),
    upgradeStore: async (store) => {
      said.order.push('upgradeStore');
      said.upgraded.push(store);
      await over.upgradeStore?.(store);
    },
    fingerprints: async () => ['deals/open'],
    fingerprintsFor: async () => ['deals/open'],
    onWrite: () => () => undefined,
    telemetry: undefined,
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

  it('is what a manifest holds in `features`: a name, the tables it keeps, and a function to start it with', () => {
    const integrations = createIntegrations();
    expect(integrations.name).toBe('integrations');
    // The three tables that are its own, said before anything runs, and one
    // sequence of its own, for the table frame grants are kept in.
    expect(integrations.tables?.names).toEqual(['integrations', 'integration_actions', 'integration_frame_grants']);
    expect((integrations.tables?.sequences ?? []).map((sequence) => sequence.id)).toEqual(['nisc.moss.integrations']);
    expect(typeof integrations.start).toBe('function');
  });
});

// THE DOCUMENTS IN ITS ROWS ARE ITS OWN TO BRING CURRENT, not the core's.
describe('createIntegrations — the stored actions', () => {
  it('are brought to this code\'s grammars by the feature when it starts, before one is read', async () => {
    const { seams, said } = await world();
    await createIntegrations().start(seams);
    expect(said.upgraded).toEqual([{ table: 'integration_actions', column: 'definition', stamp: 'grammar', kind: 'nisc.nova/action', key: ['integration_id', 'action_id'] }]);
    expect(said.order.indexOf('upgradeStore')).toBe(0);
    expect(said.order).toContain('integrations/stored-actions');
  });

  it('a row that cannot be brought current refuses the start, and so the boot', async () => {
    const tooNew = new Error('integration_actions (integration_id="belts"): written by newer code');
    const { seams, said } = await world({
      upgradeStore: async () => {
        throw tooNew;
      },
    });
    await expect(createIntegrations().start(seams)).rejects.toBe(tooNew);
    expect(said.replaced).toEqual([]);
  });
});

describe('createIntegrations — started with the seams', () => {
  it('adds itself through them: its own entries, a credential, a rule for what is installed, a set in rows, a wrap, and its routes', async () => {
    const { seams, said, server, operator } = await world();
    await createIntegrations().start(seams);

    // Its reads and writes are entries it hands over once, and names no table
    // with them: every one is named under `integrations/`, and no two alike.
    expect(said.owned).toHaveLength(1);
    const fingerprints = (said.owned[0] ?? []).map((entry) => entry.fingerprint);
    expect(fingerprints.every((fingerprint) => fingerprint.startsWith('integrations/'))).toBe(true);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    expect([...said.credentials.keys()]).toEqual(['ik_']);
    expect(said.loaders).toHaveLength(1);
    expect(said.wraps).toHaveLength(1);
    // The rule: an integration's action is there only where it is installed,
    // and an action that is nobody's is always there.
    const [installedOnly] = said.catalogFilters;
    expect(said.catalogFilters).toHaveLength(1);
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

  // THE SEED IS THE FEATURE'S OWN SETTING: `createIntegrations({ signingSeed })`,
  // so no other feature is handed the private half of the key assertions are
  // signed with. The feature makes its signer when it is started: a start that
  // throws refuses the boot.
  it('a signing seed that cannot be a key refuses the start, and so the boot', async () => {
    const { seams, said } = await world();
    await expect(createIntegrations({ signingSeed: 'consent-check-seed' }).start(seams)).rejects.toThrow(/signing seed.*decodes to 13 bytes.*`signingSeed` of `createIntegrations`/);
    // refused before anything was added to the app
    expect(said.credentials.size).toBe(0);
    expect(said.wraps).toEqual([]);
  });

  it('signs with the seed it was created with, and with a key of its own when it was given none', async () => {
    const verifyKeyOf = async (config: Parameters<typeof createIntegrations>[0]): Promise<unknown> => {
      const { seams, server } = await world();
      await createIntegrations(config).start(seams);
      return (await server.request('/api/integrations/verify-key')).json();
    };
    const seed = Buffer.alloc(32, 7).toString('base64');
    const seeded = await verifyKeyOf({ signingSeed: seed });
    expect(seeded).toMatchObject({ key: expect.any(String) });
    // The same seed is the same key, in another process as in this one.
    expect(await verifyKeyOf({ signingSeed: seed })).toEqual(seeded);
    expect(await verifyKeyOf({ signingSeed: Buffer.alloc(32, 8).toString('base64') })).not.toEqual(seeded);
    // No seed: a key made at the start and kept nowhere, so never the same twice.
    expect(await verifyKeyOf({})).not.toEqual(await verifyKeyOf({}));
  });

  it('hands over what was approved before this process started, and nothing when nothing was', async () => {
    const empty = await world();
    await createIntegrations().start(empty.seams);
    expect(empty.said.replaced).toEqual([]);

    const approved = await world({ replay: replayOver({ stored: [{ integration_id: 'belts', action_id: desk.id, definition: desk, grammar: {} }] }) });
    await createIntegrations().start(approved.seams);
    expect(approved.said.replaced).toEqual([{ [desk.id]: desk }]);
    // ...and the loader it named reads the same rows again.
    expect(await approved.said.loaders[0]?.()).toEqual({ [desk.id]: desk });
  });

  it('a stored definition nova does not read is left out, and the rest is served', async () => {
    const { seams, said } = await world({
      replay: replayOver({
        stored: [
          { integration_id: 'belts', action_id: desk.id, definition: desk, grammar: {} },
          { integration_id: 'belts', action_id: 'ext.desk.belts.broken', definition: { id: 'ext.desk.belts.broken', tittle: 'A typo' }, grammar: {} },
        ],
      }),
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await createIntegrations().start(seams);
      expect(said.replaced).toEqual([{ [desk.id]: desk }]);
      // With a line that names it, as one in a newer grammar gets.
      expect(logged.mock.calls.map(([line]) => String(line))).toEqual([expect.stringMatching(/^\[moss\] integration action "ext\.desk\.belts\.broken" is not served: it is not an action nova reads/)]);
    } finally {
      logged.mockRestore();
    }
  });

  it('the calls work from then on, by the replay the server handed over', async () => {
    const { seams } = await world({
      replay: replayOver({
        keys: { ik_belts: 'belts' },
        attached: [
          { integration_id: 'pay', action_id: 'ext.desk.pay.strip', preview: null, attach_to: 'people.detail' },
          { integration_id: 'belts', action_id: 'ext.desk.belts.panel', preview: '/integrations/belts/preview', attach_to: 'people.detail' },
          { integration_id: 'pay', action_id: 'ext.desk.pay.panel', preview: null, attach_to: 'somewhere.else' },
        ],
      }),
    });
    const integrations = createIntegrations();
    await integrations.start(seams);

    // In the order of the action ids, whichever integration each belongs to.
    expect(await integrations.listAttachments('people.detail')).toEqual([
      { actionId: 'ext.desk.belts.panel', preview: '/integrations/belts/preview' },
      { actionId: 'ext.desk.pay.strip', preview: '' },
    ]);
    expect(await integrations.listPlacements()).toEqual({});
    expect(await integrations.integrationByKey('ik_belts')).toBe('belts');
    expect(await integrations.integrationByKey('ik_nobody')).toBeUndefined();
    await expect(integrations.callIntegration('ghost', 'sync', { principal: 'i_mara' })).rejects.toThrow('moss: callIntegration("ghost"): no such integration.');
  });

  it('a list longer than one page is read to its end, each page asked for after the last row of the one before', async () => {
    // One page and three rows more, in the order of an action's key.
    const placed = Array.from({ length: PAGE + 3 }, (_, at) => ({ integration_id: 'belts', action_id: `ext.desk.belts.a${String(at).padStart(4, '0')}`, place_in: 'people.hub' }));
    const asked: Record<string, unknown>[] = [];
    const { seams } = await world({
      replay: async (fingerprint, context) => {
        if (fingerprint !== 'integrations/placements') return [];
        asked.push(context);
        return placed.filter((row) => row.action_id > String(context['after_action'])).slice(0, PAGE);
      },
    });
    const integrations = createIntegrations();
    await integrations.start(seams);

    expect(Object.keys(await integrations.listPlacements())).toHaveLength(PAGE + 3);
    expect(asked).toEqual([
      { after_integration: '', after_action: '' },
      { after_integration: 'belts', after_action: placed[PAGE - 1]?.action_id },
    ]);
  });
});

// AN APPROVAL, with the registry held in a map: one integration that was
// registered and not approved, the action it shipped, and every write that is
// made, by the fingerprint of its entry.
describe('the operator approves an integration', () => {
  const REFUSAL = 'Refresh refused — charter incoherent over the new artifacts:\n  no role grants "ext.desk.belts.roster"';
  const registered = () => {
    // `kept`: what each write was handed beside the integration's id.
    const held = { status: 'pending', writes: [] as string[], kept: [] as Record<string, unknown>[] };
    const shipped = { integration_id: 'belts', action_id: desk.id, definition: desk, grammar: {} };
    const replay: Replay = async (fingerprint, context) => {
      const isBelts = context['id'] === 'belts';
      if (fingerprint === 'integrations/requested') return isBelts ? [{ requested_data: ['people.read'] }] : [];
      if (fingerprint === 'integrations/actions-of') return isBelts ? [shipped] : [];
      if (fingerprint === 'integrations/stored-actions') return held.status === 'approved' ? [shipped] : [];
      if (fingerprint === 'integrations/approve' || fingerprint === 'integrations/set-back-to-pending') {
        held.writes.push(fingerprint);
        const { id: _id, ...kept } = context;
        held.kept.push(kept);
        if (isBelts) held.status = fingerprint === 'integrations/approve' ? 'approved' : 'pending';
      }
      return [];
    };
    return { held, replay };
  };
  const approve = (operator: Hono<FeatureEnv>, id: string): Promise<Response> => Promise.resolve(operator.request(`/integrations/${id}/approve`, { method: 'POST' }));

  it('one the app would not serve is refused before anything is written', async () => {
    const { held, replay } = registered();
    const { seams, said, operator } = await world({ replay, refuses: (actions) => (desk.id in actions ? REFUSAL : undefined) });
    await createIntegrations().start(seams);

    const answered = await approve(operator, 'belts');
    expect(answered.status).toBe(422);
    expect(await answered.json()).toEqual({ message: 'Refused — the app would not serve this.', reasons: [`Error: ${REFUSAL}`] });
    // Nothing was written, so there is nothing to take back: the row is as it
    // was, and the running manifest was handed nothing.
    expect(held.writes).toEqual([]);
    expect(held.status).toBe('pending');
    expect(said.replaced).toEqual([]);
  });

  it('one the app would serve is written once, and its actions are handed to the running manifest', async () => {
    const { held, replay } = registered();
    const { seams, said, operator } = await world({ replay });
    await createIntegrations().start(seams);

    const answered = await approve(operator, 'belts');
    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual({ id: 'belts', status: 'approved', granted: ['people.read'] });
    expect(held.writes).toEqual(['integrations/approve']);
    expect(said.replaced).toEqual([{ [desk.id]: desk }]);
  });

  // THE QUESTION IS ANSWERED YES, AND THE HAND-OVER IS THEN REFUSED: something
  // else changed between the two (another approval, a set the app handed over),
  // or the rows could not be read again. The approval is already written, so it
  // is taken back: left as approved, every process that read the rows next
  // would be refused them, and so would the next boot.
  it('one whose actions the app then does not take is taken back: pending again, with why on the row and in the answer', async () => {
    const { held, replay } = registered();
    // Asked first, and not refused; refused when the set is handed over.
    const handed = { count: 0 };
    const { seams, said, operator } = await world({ replay, refuses: (actions) => (desk.id in actions && (handed.count += 1) > 1 ? REFUSAL : undefined) });
    await createIntegrations().start(seams);

    const answered = await approve(operator, 'belts');
    expect(answered.status).toBe(422);
    expect(await answered.json()).toEqual({ message: 'Refused — the app would not serve this.', reasons: [`Error: ${REFUSAL}`] });
    expect(held.writes).toEqual(['integrations/approve', 'integrations/set-back-to-pending']);
    expect(held.kept[1]).toEqual({ last_error: `Error: ${REFUSAL}` });
    expect(held.status).toBe('pending');
    // What is served is read again from the rows as they are now: without it.
    expect(said.replaced).toEqual([{}]);
  });

  // WHAT THE TAKING BACK WRITES: the feature's entry, compiled by vex's own
  // Postgres adapter and replayed the way a server replays it, on a client
  // that runs nothing and keeps the statement it is sent.
  it('the taking back is one statement on that integration’s row: pending, and why', async () => {
    const column = (name: string, primaryKey = false): DatabaseSchema['entities'][number]['fields'][number] => ({ name, type: 'text', normalizedType: 'string', nullable: !primaryKey, primaryKey });
    const schema: DatabaseSchema = {
      entities: [{ name: 'integrations', table: 'integrations', fields: [column('id', true), column('status'), column('last_error')], relations: [], indexes: [] }],
    };
    const written: { sql: string; params: readonly unknown[] }[] = [];
    const db: MutationClient = {
      query: async (sql, params) => {
        written.push({ sql, params: params ?? [] });
        return { rows: [] };
      },
    };
    const adapter = { ...createPostgresAdapter({ pool: { query: async () => ({ rows: [] }) } }), introspect: async () => schema };
    const replay = await createOwnEntries({ adapter, db, engine: { invalidate: () => undefined } })({ owner: 'the feature "integrations"', entries: REGISTRY_ENTRIES, tables: REGISTRY_TABLES });

    await setBackToPending(replay, 'belts', 'Error: the app would not serve this');

    expect(written).toEqual([{ sql: "UPDATE integrations SET status = 'pending', last_error = $1 WHERE integrations.id = $2 RETURNING *", params: ['Error: the app would not serve this', 'belts'] }]);
  });

  it('one that is not there is a 404, and nothing is written', async () => {
    const { held, replay } = registered();
    const { seams, operator } = await world({ replay });
    await createIntegrations().start(seams);

    const answered = await approve(operator, 'ghost');
    expect(answered.status).toBe(404);
    expect(held.writes).toEqual([]);
  });
});

describe('the integration key, as the credential the feature registers', () => {
  const keyed = async (config: Parameters<typeof createIntegrations>[0], who?: (principal: string | null) => PrincipalIdentity) => {
    const { seams, said } = await world({ replay: replayOver({ keys: { ik_belts: 'belts' } }), ...(who === undefined ? {} : { who }) });
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

  it('an id that is not a name is refused before anything is fetched or written', async () => {
    const fetched: string[] = [];
    const written: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = async (url) => {
      fetched.push(String(url));
      return new Response('{}', { status: 404 });
    };
    try {
      const { seams, operator } = await world({
        replay: async (fingerprint) => {
          written.push(fingerprint);
          return [];
        },
      });
      await createIntegrations().start(seams);
      written.length = 0;
      // Capitals, a path, a dot (an action's namespace is split on them), a
      // digit first, an underscore, a hyphen first, a space.
      for (const id of ['Belts', 'belts/../pay', 'be.lts', '9belts', 'belts_two', '-belts', 'belts two']) {
        const answered = await operator.request('/integrations', { method: 'POST', body: JSON.stringify({ id, url: 'https://belts.example' }), headers: { 'content-type': 'application/json' } });
        expect([id, answered.status]).toEqual([id, 400]);
        expect(await answered.json()).toEqual({ message: 'An integration id is lower-case letters, digits and hyphens, and starts with a letter.' });
      }
      expect(fetched).toEqual([]);
      expect(written).toEqual([]);
    } finally {
      globalThis.fetch = real;
    }
  });

  // TWO REGISTRATIONS OF ONE NEW INTEGRATION AT ONCE. Each asks how the
  // integration stands before either has landed, is told it holds no key, mints
  // one and lands with it. The row keeps one hash, so only one of the two keys
  // can be answered.
  //
  // The registry here is a map that does what the database does with the
  // feature's entries (held against a database in integrations.test.ts): a
  // landing that comes with a key keeps it only where the row holds none, and
  // answers the row it wrote the key on.
  it('two registrations of one new integration at once: one of them is answered a key, and it is the key that is kept', async () => {
    const kept = new Map<string, string>();
    const landed = new Set<string>();
    const registry: Replay = async (fingerprint, context) => {
      const id = String(context['id']);
      if (fingerprint === 'integrations/registration') return landed.has(id) ? [{ status: 'pending', key_hash: kept.get(id) ?? null }] : [];
      if (fingerprint === 'integrations/write-bundle') return void landed.add(id);
      if (fingerprint === 'integrations/write-bundle-and-keep-key') {
        landed.add(id);
        const row = { id, key_hash: kept.get(id) ?? null };
        if (kept.has(id)) return row;
        kept.set(id, String(context['key_hash']));
        return [row, { id, key_hash: kept.get(id) }];
      }
      return [];
    };
    const real = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ integration: 'belts', meta: { title: 'Belts' }, actions: { [desk.id]: desk } }), { status: 200, headers: { 'content-type': 'application/json' } });
    try {
      const { seams, operator } = await world({ replay: registry });
      await createIntegrations().start(seams);
      const register = async (): Promise<{ status: number; key: unknown }> => {
        const answered = await operator.request('/integrations', { method: 'POST', body: JSON.stringify({ id: 'belts', url: 'https://belts.example' }), headers: { 'content-type': 'application/json' } });
        const body: unknown = await answered.json();
        return { status: answered.status, key: typeof body === 'object' && body !== null && 'key' in body ? body.key : undefined };
      };

      const answers = await Promise.all([register(), register()]);
      expect(answers.map((answer) => answer.status)).toEqual([200, 200]);
      const keys = answers.map((answer) => answer.key).filter((key) => typeof key === 'string');
      expect(keys).toHaveLength(1);
      expect(hashIntegrationKey(String(keys[0]))).toBe(kept.get('belts'));

      // And an import after those is answered none, as any import after the first.
      expect((await register()).key).toBeUndefined();
    } finally {
      globalThis.fetch = real;
    }
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
      const { seams, server, caller } = await world({ replay: replayOver({ found: { belts: found } }), who: () => ({ roles: ['desk'], installed: ['belts'] }) });
      await createIntegrations().start({ ...seams, grantedActionIds: (roles) => (roles.includes('desk') ? ['ext.desk.belts.roster'] : []) });
      caller.principal = 'i_mara';

      expect((await server.request('/integrations/belts/roster?view=summary')).status).toBe(200);
      expect((await server.request('/integrations/belts/admin')).status).toBe(404);
      expect(sent).toEqual(['https://belts.example/roster?view=summary']);
    } finally {
      globalThis.fetch = real;
    }
  });
});

// NO CALL OUT WAITS FOR EVER. The service here never answers (./never-answers.ts),
// and the deployment allows a call 20 ms (`outboundTimeoutMs`).
describe('a service that never answers', () => {
  const found = { url: 'https://belts.example', status: 'approved', reach: { '/integrations/belts/roster': ['ext.desk.belts.roster'] }, frames: {} };
  const against = async <Answer>(run: (started: Awaited<ReturnType<typeof world>>, signals: (AbortSignal | undefined)[]) => Promise<Answer>): Promise<Answer> => {
    const service = neverAnswers();
    const real = globalThis.fetch;
    globalThis.fetch = service.fetch;
    try {
      const started = await world({ replay: replayOver({ found: { belts: found } }), who: () => ({ roles: ['desk'], installed: ['belts'] }) });
      await createIntegrations({ outboundTimeoutMs: 20 }).start({ ...started.seams, grantedActionIds: () => ['ext.desk.belts.roster'] });
      return await run(started, service.signals);
    } finally {
      globalThis.fetch = real;
    }
  };
  const endedBy = (signal: AbortSignal | undefined): string => (signal === undefined ? 'no signal' : signal.aborted ? String(signal.reason) : 'a signal that has not fired');

  it('a bundle that is being fetched at registration is given up on, and the import is refused as one that did not answer', async () => {
    await against(async ({ operator }, signals) => {
      const answered = await operator.request('/integrations', { method: 'POST', body: JSON.stringify({ id: 'belts', url: 'https://belts.example' }), headers: { 'content-type': 'application/json' } });
      expect(answered.status).toBe(502);
      expect(await answered.json()).toEqual({ message: 'The integration did not answer with a bundle.' });
      expect(signals.map(endedBy)).toEqual([expect.stringMatching(/^TimeoutError/)]);
    });
  });

  it('the operator’s probe is given up on, and says so in what it answers', async () => {
    await against(async ({ operator }, signals) => {
      const answered = await operator.request('/integrations/belts/probe', { method: 'POST' });
      expect(await answered.json()).toMatchObject({ status: 0, body: expect.stringMatching(/^TimeoutError/) });
      expect(signals.map(endedBy)).toEqual([expect.stringMatching(/^TimeoutError/)]);
    });
  });

  it('a screen’s call through the proxy is given up on, and reads as an integration that is unreachable', async () => {
    await against(async ({ server, caller }, signals) => {
      caller.principal = 'i_mara';
      const answered = await server.request('/integrations/belts/roster');
      expect(answered.status).toBe(502);
      expect(signals.map(endedBy)).toEqual([expect.stringMatching(/^TimeoutError/)]);
    });
  });
});

// A FRAME GRANT IS A ROW. Two processes of one deployment are two features
// started over one registry: the map here stands in for the table both read
// and write, keyed as the table is, by the hash of the grant.
describe('a frame grant, with two processes behind one address', () => {
  const PAGE_PATH = '/integrations/belts/embed/pay';
  const found = { url: 'https://belts.example', status: 'approved', reach: {}, frames: { [PAGE_PATH]: 'ext.desk.belts.pay' } };
  const deployment = () => {
    const grants = new Map<string, Row>();
    const replay: Replay = async (fingerprint, context) => {
      if (fingerprint === 'integrations/find') return context['id'] === 'belts' ? [found] : [];
      if (fingerprint === 'integrations/keep-frame-grant') {
        for (const [hash, row] of grants) if (String(row['expires_at']) <= String(context['now'])) grants.delete(hash);
        grants.set(String(context['grant_hash']), { integration_id: context['integration_id'], principal: context['principal'], path: context['path'], expires_at: context['expires_at'] });
        return [];
      }
      if (fingerprint === 'integrations/frame-grant') {
        const row = grants.get(String(context['grant_hash']));
        return row !== undefined && row['integration_id'] === context['integration_id'] && String(row['expires_at']) > String(context['now']) ? [row] : [];
      }
      return [];
    };
    // One process, serving people who hold `holding` of the actions in force.
    const process = async (holding: readonly string[] = ['ext.desk.belts.pay']) => {
      const started = await world({ replay, who: () => ({ roles: ['desk'], installed: ['belts'] }) });
      await createIntegrations().start({ ...started.seams, grantedActionIds: () => [...holding] });
      return started;
    };
    return { grants, process };
  };
  // The page the integration serves, whoever asks for it.
  const serving = async <Answer>(run: () => Promise<Answer>): Promise<Answer> => {
    const real = globalThis.fetch;
    globalThis.fetch = async () => new Response('<html>pay</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    try {
      return await run();
    } finally {
      globalThis.fetch = real;
    }
  };
  const grantFrom = async (one: Awaited<ReturnType<typeof world>>): Promise<string> => {
    one.caller.principal = 'i_mara';
    const minted = await one.server.request('/api/integrations/frame', { method: 'POST', body: JSON.stringify({ path: PAGE_PATH }), headers: { 'content-type': 'application/json' } });
    expect(minted.status).toBe(200);
    return z.object({ src: z.string() }).parse(await minted.json()).src;
  };

  it('a grant one process minted is redeemed by the other', async () => {
    await serving(async () => {
      const { grants, process } = deployment();
      const [one, other] = [await process(), await process()];
      const src = await grantFrom(one);

      const page = await other.server.request(src);
      expect(page.status).toBe(200);
      expect(await page.text()).toBe('<html>pay</html>');
      // ...and the page's call back, on the same grant.
      expect((await other.server.request(`${src}/session`, { method: 'POST', body: '{}' })).status).toBe(200);

      // What is kept is the hash: the grant itself is in no row, so a copy of
      // the table opens nothing.
      const token = src.split('/').at(-1) ?? '';
      expect(token).toMatch(/^[0-9a-f]{48}$/);
      expect([...grants.keys()]).toHaveLength(1);
      expect(JSON.stringify([...grants])).not.toContain(token);
    });
  });

  // THE DECLARATION IS THE PERIMETER, AND THE SCREEN THAT OWNS THE PAGE IS WHO
  // IT IS FOR. Signed in and installed is not enough: a member of a studio must
  // not be handed the page that mounts a payment provider's onboarding form
  // against the studio's merchant account.
  const askFor = (one: Awaited<ReturnType<typeof world>>, path: string): Promise<Response> =>
    Promise.resolve(one.server.request('/api/integrations/frame', { method: 'POST', body: JSON.stringify({ path }), headers: { 'content-type': 'application/json' } }));

  it('a grant is minted for somebody who holds the action that owns the page, and for nobody else', async () => {
    const { grants, process } = deployment();
    // Signed in, at a tenant that installed the integration, and holding
    // another of its actions: not the one this page is the screen of.
    const member = await process(['ext.member.belts.card']);
    member.caller.principal = 'm_juno';
    const refused = await askFor(member, PAGE_PATH);
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ message: 'No such frame.' });
    expect(grants.size).toBe(0);
  });

  it('a grant is minted for a page the bundle declared, and for no other path of the integration', async () => {
    const { grants, process } = deployment();
    const desk = await process();
    desk.caller.principal = 'i_mara';
    // A path the integration may well serve, and never declared as a frame.
    const refused = await askFor(desk, '/integrations/belts/embed/admin');
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ message: 'No such frame.' });
    expect(grants.size).toBe(0);
    // The page it did declare, for the same person: minted.
    expect((await askFor(desk, PAGE_PATH)).status).toBe(200);
    expect(grants.size).toBe(1);
  });

  it('a grant is for one integration, and for half an hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      await serving(async () => {
        const { process } = deployment();
        const [one, other] = [await process(), await process()];
        const src = await grantFrom(one);
        // Presented under another integration's address, it opens nothing.
        expect((await other.server.request(src.replace('/belts/', '/pay/'))).status).toBe(404);
        vi.setSystemTime(Date.now() + 29 * 60_000);
        expect((await other.server.request(src)).status).toBe(200);
        vi.setSystemTime(Date.now() + 2 * 60_000);
        expect((await other.server.request(src)).status).toBe(404);
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
