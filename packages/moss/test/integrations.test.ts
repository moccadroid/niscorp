import { describe, it, expect, vi, beforeAll } from 'vitest';
import { z } from 'zod';
import { createPglitePool } from '@niscorp/vex/pglite';
import type { PgPool } from '@niscorp/vex';
import type { Replay } from '../src/data/own-entries';
import { failingAt, registryOver } from './registry-db';
import { endlessChains, layoutMisfits } from '../src/manifest';
import { runIntake } from '../src/integrations/intake';
import { callIntegrationWith } from '../src/integrations/call';
import { createForwarder } from '../src/integrations/forward';
import { findIntegration, writeBundle, listIntegrations, registeredIntegrations } from '../src/integrations/registry';
import type { BundleImport } from '../src/integrations/registry';
import type { IntakeContext } from '../src/integrations/intake';
import { BundleSchema } from '../src/integrations/bundle';
import type { Bundle } from '../src/integrations/bundle';
import { createAssertionSigner, verifyAssertion } from '../src/integrations/credentials';
import { pristineDatabases } from './pristine-database';

// A database of its own for each test that wants one, started from one that
// was initialised once for this file (./pristine-database.ts says why).
const freshDatabase = pristineDatabases();

// What intake is handed for one bundle: the host's two answers over a kit of
// one component, and whatever a test says beside them.
const ctx = <Extension = undefined>(over: Partial<IntakeContext<Extension>> = {}): IntakeContext<Extension> => ({
  integrationId: 'acme',
  url: 'https://acme.example',
  layoutMisfits: (layout) => layoutMisfits(layout, new Map([['Text', {}]])),
  endlessChains,
  fingerprints: new Set<string>(),
  ...over,
});

describe('an integration id', () => {
  it('is lower-case letters, digits and hyphens, starting with a letter: a bundle that says any other is refused', () => {
    for (const id of ['acme', 'acme-pay', 'a2']) {
      expect([id, runIntake({ integration: id, actions: {} }, ctx({ integrationId: id })).ok]).toEqual([id, true]);
    }
    // Each of these as the bundle's own word for itself, fetched under the same id.
    for (const id of ['Acme', 'acme.pay', 'acme/pay', '9acme', 'acme_pay', '-acme', '']) {
      const result = runIntake({ integration: id, actions: {} }, ctx({ integrationId: id }));
      expect([id, result.ok]).toEqual([id, false]);
      if (!result.ok) expect(result.reasons.join(' ')).toContain('integration');
    }
  });
});

describe('a bundle’s own fields', () => {
  it('a top-level key that is not one of them refuses the bundle, in a sentence that names the key and says where a host’s vocabulary goes', () => {
    const result = runIntake({ integration: 'acme', actions: {}, listing: { title: 'Acme' }, seats: [] }, ctx());
    expect(result).toEqual({
      ok: false,
      reasons: [
        '"listing" is not a field of a bundle. What belongs to the host app’s own vocabulary goes under `extension`.',
        '"seats" is not a field of a bundle. What belongs to the host app’s own vocabulary goes under `extension`.',
      ],
    });
  });

  // One product's vocabulary is no part of a bundle: each of its words is a
  // key like any other that moss does not know.
  it('a store listing, a placement, a capability: none is a field of a bundle', () => {
    for (const key of ['meta', 'capabilities', 'offers', 'needs', 'attachments', 'placements', 'settings', 'configuration', 'documents', 'assistants', 'frames']) {
      expect([key, runIntake({ integration: 'acme', actions: {}, [key]: {} }, ctx())]).toEqual([
        key,
        { ok: false, reasons: [`"${key}" is not a field of a bundle. What belongs to the host app’s own vocabulary goes under \`extension\`.`] },
      ]);
    }
  });

  it('a bundle that says only what it is and what it ships is taken, with nothing asked and no words', () => {
    const result = runIntake({ integration: 'acme', actions: {} }, ctx());
    expect(result).toEqual({ ok: true, bundle: { integration: 'acme', actions: {}, grants: { actions: [], data: [] }, phrasebook: {} }, extension: undefined });
  });

  it('what it asks to be allowed is two lists of names, and its words are keyed by language', () => {
    const asking = { integration: 'acme', actions: {}, grants: { actions: ['ext.desk.acme.*'], data: ['members.read'] }, phrasebook: { de: { Roster: 'Liste' } } };
    expect(runIntake(asking, ctx())).toMatchObject({ ok: true, bundle: { grants: asking.grants, phrasebook: asking.phrasebook } });
    expect(runIntake({ ...asking, grants: { data: 'members.read' } }, ctx())).toMatchObject({ ok: false, reasons: [expect.stringMatching(/^grants\.data: /)] });
    expect(runIntake({ ...asking, phrasebook: { 'de-AT': {} } }, ctx())).toMatchObject({ ok: false, reasons: [expect.stringMatching(/^phrasebook\.de-AT: /)] });
  });
});

describe('extension — the host app’s own vocabulary', () => {
  const Listing = z.object({ title: z.string(), tagline: z.string().default(''), screen: z.string().optional() }).strict();
  const roster = { id: 'ext.desk.acme.roster', title: 'Roster' };
  const carrying = (extension: unknown, actions: Record<string, unknown> = { [roster.id]: roster }): unknown => ({ integration: 'acme', actions, extension });

  it('is read by the schema the app supplied, and what the schema answers is the extension', () => {
    const result = runIntake(carrying({ title: 'Acme' }), ctx({ extension: { schema: Listing } }));
    expect(result).toMatchObject({ ok: true, extension: { title: 'Acme', tagline: '' } });
  });

  it('one the schema does not read refuses the bundle, each place it does not as a reason under `extension`', () => {
    const result = runIntake(carrying({ title: 7, colour: 'red' }), ctx({ extension: { schema: Listing } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons).toContainEqual(expect.stringMatching(/^extension\.title: /));
    expect(result.reasons).toContainEqual(expect.stringMatching(/^extension: .*colour/));
  });

  it('a bundle that carries none is read by the schema too: refused where the schema asks for one, taken where it does not', () => {
    const none = { integration: 'acme', actions: {} };
    expect(runIntake(none, ctx({ extension: { schema: Listing } }))).toMatchObject({ ok: false, reasons: [expect.stringMatching(/^extension: /)] });
    expect(runIntake(none, ctx({ extension: { schema: Listing.optional() } }))).toMatchObject({ ok: true, extension: undefined });
  });

  it('an app that supplied no schema takes no extension: a bundle that carries one is refused, and one that carries none is taken', () => {
    expect(runIntake(carrying({ title: 'Acme' }), ctx())).toEqual({ ok: false, reasons: ['extension: this app takes no extension, and the bundle carries one.'] });
    expect(runIntake({ integration: 'acme', actions: {} }, ctx())).toMatchObject({ ok: true, extension: undefined });
  });

  it('the app’s check is handed the extension and what moss knows of the bundle, and its reasons are reported with moss’s own', () => {
    const asked: unknown[] = [];
    const taking = ctx({
      fingerprints: new Set(['deals/open']),
      extension: {
        schema: Listing,
        check: (extension, bundle) => {
          asked.push({ extension, integration: bundle.integration, url: bundle.url, actions: Object.keys(bundle.actions), fingerprints: [...bundle.fingerprints], fits: bundle.layoutMisfits({ component: 'Nope' }).length });
          return extension.screen === undefined || bundle.actions[extension.screen] !== undefined ? [] : [`listing: "${extension.screen}" is not an action in this bundle`];
        },
      },
    });

    expect(runIntake(carrying({ title: 'Acme', screen: roster.id }), taking)).toMatchObject({ ok: true });
    expect(asked).toEqual([{ extension: { title: 'Acme', tagline: '', screen: roster.id }, integration: 'acme', url: 'https://acme.example', actions: [roster.id], fingerprints: ['deals/open'], fits: 1 }]);

    // One reason of moss's own (an action outside the integration's namespace)
    // and one of the app's, in one answer.
    const stray = { id: 'desk.stray' };
    const refused = runIntake(carrying({ title: 'Acme', screen: 'ext.desk.acme.ghost' }, { [stray.id]: stray }), taking);
    expect(refused).toEqual({
      ok: false,
      reasons: ['action desk.stray: not namespaced ext.<audience>.<integration>.<name>', 'listing: "ext.desk.acme.ghost" is not an action in this bundle'],
    });
  });

  it('the check is not asked about an extension the schema refused', () => {
    const asked: unknown[] = [];
    const result = runIntake(carrying({ title: 7 }), ctx({ extension: { schema: Listing, check: (extension) => (asked.push(extension), []) } }));
    expect(result.ok).toBe(false);
    expect(asked).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// callIntegration — the outbound act. The deployment calls an integration
// with nobody driving; the gates are approved + installed, the credential is
// a REAL assertion (verified here against the signer's public half, not just
// inspected), and refusals throw sentences the orchestrator must see.
// ═══════════════════════════════════════════════════════════════

describe('callIntegration', () => {
  const world = async (over: { status?: string; installed?: readonly string[] | undefined } = {}) => {
    const pool = createPglitePool(freshDatabase());
    const registry = await registryOver(pool);
    await pool.query(`INSERT INTO integrations (id, url, status) VALUES ('acme', 'https://acme.example', $1)`, [over.status ?? 'approved']);
    const signer = createAssertionSigner();
    const answered = new Response(JSON.stringify({ erased: true }), { status: 200 });
    const fetchImpl = vi.fn(async () => answered);
    const call = callIntegrationWith({
      forward: createForwarder({
        find: (id) => findIntegration(registry, id),
        resolveIdentity: async () => ({ roles: [], installed: 'installed' in over ? over.installed : ['acme'] }),
        scopeOf: async () => ({ studio_id: 's_1', audience: 'owner' }),
        mint: signer.mint,
        timeoutMs: 30_000,
        fetch: fetchImpl as unknown as typeof fetch,
      }),
    });
    return { call, fetchImpl, signer, answered };
  };

  it('an unknown integration throws, before any credential exists', async () => {
    const { call, fetchImpl } = await world();
    await expect(call('ghost', 'lifecycle/erase-party', { principal: 'i_mara' })).rejects.toThrow(/no such integration/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a pending or revoked integration throws — approval is the first gate', async () => {
    const { call, fetchImpl } = await world({ status: 'pending' });
    await expect(call('acme', 'lifecycle/erase-party', { principal: 'i_mara' })).rejects.toThrow(/not approved.*pending/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('not installed for the principal\'s tenant throws — the second gate', async () => {
    const { call, fetchImpl } = await world({ installed: ['somebody-else'] });
    await expect(call('acme', 'lifecycle/erase-party', { principal: 'i_mara' })).rejects.toThrow(/not installed/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('an app with no install seam admits — the proxy\'s rule, mirrored', async () => {
    const { call } = await world({ installed: undefined });
    const response = await call('acme', 'lifecycle/erase-party', { principal: 'i_mara' });
    expect(response.status).toBe(200);
  });

  it('mints an assertion the other end can actually verify, and returns what it answered', async () => {
    const { call, fetchImpl, signer, answered } = await world();
    const response = await call('acme', '/lifecycle/erase-party', { principal: 'i_mara', body: { member: 'i_kade' }, scope: { audience: 'owner', reason: 'gdpr' } });

    expect(response).toBe(answered);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://acme.example/lifecycle/erase-party');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ member: 'i_kade' }));

    const token = String((init.headers as Record<string, string>)['authorization']).replace(/^Bearer /, '');
    const claims = verifyAssertion(token, signer.verifyKey);
    expect(claims?.integration).toBe('acme');
    expect(claims?.principal).toBe('i_mara');
    // Resolver values first, init.scope merged over them — the deployment's
    // explicit word wins.
    expect(claims?.scope).toEqual({ studio_id: 's_1', audience: 'owner', reason: 'gdpr' });
  });

  it('a GET travels without a body', async () => {
    const { call, fetchImpl } = await world();
    await call('acme', 'lifecycle/export', { principal: 'i_mara', method: 'GET' });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('GET');
    expect('body' in init).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// THE REGISTRY AS VEX ENTRIES — every statement the registry runs on
// `integrations` and `integration_actions`, authored as a vex entry
// (../src/integrations/entries.ts) and run against a real database. One
// database for the cases that write, and each of them writes every row it
// reads, under ids no other case uses: it passes alone, and in any order.
// The lists are read from a database of their own, written once and only
// read. Where a case names SQL, it is the statement the entry stands in for,
// run on the same rows as the oracle.
// ═══════════════════════════════════════════════════════════════

describe('the registry as vex entries — each statement, against a database', () => {
  let pool: PgPool;
  let replay: Replay;
  const rows = async (text: string, values: unknown[] = []): Promise<Record<string, unknown>[]> => (await pool.query(text, values)).rows;
  const json = (value: unknown): string => JSON.stringify(value);

  beforeAll(async () => {
    pool = createPglitePool(freshDatabase());
    replay = await registryOver(pool);
  });

  // What a bundle says of its integration, as the registry hands it over.
  const landing = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id,
    url: `https://${id}.example`,
    requested_actions: ['ext.desk.*'],
    requested_data: ['members.read'],
    reach: { [`/integrations/${id}/roster`]: [`ext.desk.${id}.roster`] },
    phrasebook: { de: { Hello: 'Hallo' } },
    // JSON text, as the registry hands it over.
    extension: JSON.stringify({ listing: { title: 'Belts' } }),
    last_import_at: '2026-10-10T08:00:00.000Z',
    ...over,
  });
  // One action of a bundle, as the list a landing is handed carries it: the
  // row it is kept as is this, with the integration's id.
  const action = (integration: string, name: string): Record<string, unknown> => ({
    action_id: `ext.desk.${integration}.${name}`,
    definition: { id: `ext.desk.${integration}.${name}`, title: name },
    grammar: { 'nisc.nova': 3 },
  });
  const actionsOf = (integration: string): Promise<Record<string, unknown>[]> => rows('SELECT * FROM integration_actions WHERE integration_id = $1 ORDER BY action_id', [integration]);

  it('1 · find: one integration by its id, and no row for an id that is not there', async () => {
    const reach = { '/integrations/found/roster': ['ext.desk.found.roster'] };
    await pool.query(`INSERT INTO integrations (id, url, status, reach) VALUES ('found', 'https://found.example', 'approved', $1::jsonb)`, [json(reach)]);
    expect(await replay('integrations/find', { id: 'found' })).toEqual([{ url: 'https://found.example', status: 'approved', reach }]);
    expect(await replay('integrations/find', { id: 'found' })).toEqual(await rows('SELECT url, status, reach FROM integrations WHERE id = $1', ['found']));
    expect(await replay('integrations/find', { id: 'ghost' })).toEqual([]);
  });

  it('2 · record a failed import: a row that was not there arrives pending; one that was keeps all but its address and the reason', async () => {
    await replay('integrations/record-failed-import', { id: 'failed', url: 'https://one.example', last_error: 'the service did not answer with a bundle' });
    expect(await rows(`SELECT url, status, requested_data, extension, last_error FROM integrations WHERE id = 'failed'`)).toEqual([
      { url: 'https://one.example', status: 'pending', requested_data: [], extension: null, last_error: 'the service did not answer with a bundle' },
    ]);
    await pool.query(`UPDATE integrations SET requested_data = '["members.read"]'::jsonb, status = 'approved', key_hash = 'hash-of-failed' WHERE id = 'failed'`);
    await replay('integrations/record-failed-import', { id: 'failed', url: 'https://two.example', last_error: 'Refused.' });
    expect(await rows(`SELECT url, status, requested_data, key_hash, last_error FROM integrations WHERE id = 'failed'`)).toEqual([
      { url: 'https://two.example', status: 'approved', requested_data: ['members.read'], key_hash: 'hash-of-failed', last_error: 'Refused.' },
    ]);
  });

  it('3 · registration: what the row says of approval and of a key', async () => {
    await pool.query(`INSERT INTO integrations (id, url, status, key_hash) VALUES ('keyed', 'https://keyed.example', 'approved', 'abc'), ('unkeyed', 'https://unkeyed.example', 'pending', NULL)`);
    expect(await replay('integrations/registration', { id: 'keyed' })).toEqual([{ status: 'approved', key_hash: 'abc' }]);
    expect(await replay('integrations/registration', { id: 'unkeyed' })).toEqual([{ status: 'pending', key_hash: null }]);
    expect(await replay('integrations/registration', { id: 'ghost' })).toEqual([]);
  });

  // 4, 5, 6 and 7 are one batch (the case after these holds that it lands whole
  // or not at all).
  it('4 · land a bundle: every column the bundle says, the instant it was handed, and no error', async () => {
    await replay('integrations/write-bundle', { ...landing('landed'), actions: [] });
    const { id: _id, last_import_at: _at, ...said } = landing('landed');
    const [first] = await rows(`SELECT * FROM integrations WHERE id = 'landed'`);
    expect(first).toMatchObject({ ...said, extension: { listing: { title: 'Belts' } }, id: 'landed', status: 'pending', key_hash: null, approved_data: [], last_error: null });
    expect(new Date(String(first?.['last_import_at'])).toISOString()).toBe('2026-10-10T08:00:00.000Z');

    // Again, on the row that is there: each column is replaced (an empty list
    // lands as an empty list), and what the bundle does not say stays.
    await pool.query(`UPDATE integrations SET status = 'approved', key_hash = 'hash-of-landed', approved_data = '["members.read"]'::jsonb, last_error = 'old' WHERE id = 'landed'`);
    const again = landing('landed', { url: 'https://landed.example/v2', requested_data: [], reach: {}, extension: null, last_import_at: '2026-10-11T09:30:00.000Z' });
    await replay('integrations/write-bundle', { ...again, actions: [] });
    const [second] = await rows(`SELECT * FROM integrations WHERE id = 'landed'`);
    expect(second).toMatchObject({ url: 'https://landed.example/v2', requested_data: [], reach: {}, requested_actions: ['ext.desk.*'], phrasebook: { de: { Hello: 'Hallo' } }, extension: null });
    expect(second).toMatchObject({ status: 'approved', key_hash: 'hash-of-landed', approved_data: ['members.read'], last_error: null });
    expect(new Date(String(second?.['last_import_at'])).toISOString()).toBe('2026-10-11T09:30:00.000Z');
    expect(await rows(`SELECT count(*)::int AS n FROM integrations WHERE id = 'landed'`)).toEqual([{ n: 1 }]);
  });

  // What the row keeps of the host app's own vocabulary is whatever value the
  // app's `prepare` answered: it is read back as that value, by the app's schema.
  it('an extension is kept as the value it is, and read back as it: an object, a list, a text, a number, or none', async () => {
    const kept = async (extension: unknown): Promise<unknown> => {
      const bundle = BundleSchema.parse({ integration: 'extended', actions: {} });
      await writeBundle(replay, { id: 'extended', url: 'https://extended.example', bundle, extension, stamp: {} });
      return (await registeredIntegrations(replay, z.unknown())).find((integration) => integration.id === 'extended');
    };
    const registered = (extension: unknown): unknown => ({ id: 'extended', url: 'https://extended.example', status: 'pending', extension });
    const listing = { listing: { title: 'Belts', press: ['/blobs/a.png'] }, placed: { 'ext.desk.extended.roster': 'hub.people' } };
    expect(await kept(listing)).toEqual(registered(listing));
    expect(await kept(['hub.people', 'hub.me'])).toEqual(registered(['hub.people', 'hub.me']));
    expect(await kept('a sentence')).toEqual(registered('a sentence'));
    expect(await kept(7)).toEqual(registered(7));
    expect(await kept(undefined)).toEqual(registered(undefined));
    // An app that supplied no schema reads none, whatever the row holds.
    await kept(listing);
    expect((await registeredIntegrations(replay, undefined)).find((integration) => integration.id === 'extended')).toEqual(registered(undefined));
  });

  it('5, 6 · ...with its actions, in place of the ones it shipped before, and of no other integration’s', async () => {
    await replay('integrations/write-bundle', { ...landing('landed'), actions: [action('landed', 'roster'), action('landed', 'board')] });
    await replay('integrations/write-bundle', { ...landing('other'), actions: [action('other', 'roster')] });
    expect(await actionsOf('landed')).toEqual([{ integration_id: 'landed', ...action('landed', 'board') }, { integration_id: 'landed', ...action('landed', 'roster') }]);

    // The next import ships one action: the two before it leave.
    await replay('integrations/write-bundle', { ...landing('landed'), actions: [action('landed', 'solo')] });
    expect(await actionsOf('landed')).toEqual([{ integration_id: 'landed', ...action('landed', 'solo') }]);
    // ...and one that ships none leaves none.
    await replay('integrations/write-bundle', { ...landing('landed'), actions: [] });
    expect(await actionsOf('landed')).toEqual([]);
    expect(await actionsOf('other')).toEqual([{ integration_id: 'other', ...action('other', 'roster') }]);
  });

  it('7 · ...and with the hash of its key, on the import a key is issued with', async () => {
    await replay('integrations/write-bundle-and-keep-key', { ...landing('issued'), key_hash: 'deadbeef', actions: [] });
    expect(await rows(`SELECT id, key_hash FROM integrations WHERE key_hash = 'deadbeef'`)).toEqual([{ id: 'issued', key_hash: 'deadbeef' }]);
    // A row that is there with no key (an import that failed came first) is
    // issued one the same way, with the actions the bundle ships.
    await replay('integrations/record-failed-import', { id: 'late', url: 'https://late.example', last_error: 'Refused.' });
    await replay('integrations/write-bundle-and-keep-key', { ...landing('late'), key_hash: 'cafe', actions: [action('late', 'roster')] });
    expect(await rows(`SELECT key_hash, requested_data, last_error FROM integrations WHERE id = 'late'`)).toEqual([{ key_hash: 'cafe', requested_data: ['members.read'], last_error: null }]);
    expect(await actionsOf('late')).toEqual([{ integration_id: 'late', ...action('late', 'roster') }]);
  });

  // TWO REGISTRATIONS OF ONE NEW INTEGRATION AT ONCE each find no key, each
  // mint one, and each land with their own. The key is kept where none is
  // held, and what the landing answers says whether it was.
  it('7 · ...and a row that holds a key keeps it: a landing that comes with another lands its bundle and not its key', async () => {
    const rowsIn = (answered: unknown): unknown[] => (Array.isArray(answered) ? answered : [answered]);
    const keptIn = (answered: unknown, hash: string): boolean => rowsIn(answered).some((row) => typeof row === 'object' && row !== null && 'key_hash' in row && row.key_hash === hash);

    const first = await replay('integrations/write-bundle-and-keep-key', { ...landing('raced'), key_hash: 'first-key', actions: [action('raced', 'one')] });
    expect(keptIn(first, 'first-key')).toBe(true);

    const second = await replay('integrations/write-bundle-and-keep-key', { ...landing('raced', { requested_data: ['bookings.read'] }), key_hash: 'second-key', actions: [action('raced', 'two')] });
    // The bundle landed: it is the later import.
    expect(await rows(`SELECT requested_data, key_hash FROM integrations WHERE id = 'raced'`)).toEqual([{ requested_data: ['bookings.read'], key_hash: 'first-key' }]);
    expect(await actionsOf('raced')).toEqual([{ integration_id: 'raced', ...action('raced', 'two') }]);
    // Its key did not, and it is told so.
    expect(keptIn(second, 'second-key')).toBe(false);
    expect(await rows(`SELECT id FROM integrations WHERE key_hash = 'second-key'`)).toEqual([]);
  });

  it('8, 9 · approve: what was asked for is read, and written as what is granted', async () => {
    await pool.query(`INSERT INTO integrations (id, url, requested_data) VALUES ('asking', 'https://asking.example', '["members.read","bookings.read"]'::jsonb)`);
    expect(await replay('integrations/requested', { id: 'asking' })).toEqual([{ requested_data: ['members.read', 'bookings.read'] }]);
    expect(await replay('integrations/requested', { id: 'ghost' })).toEqual([]);
    await replay('integrations/approve', { id: 'asking', approved_data: ['members.read', 'bookings.read'] });
    expect(await rows(`SELECT status, approved_data FROM integrations WHERE id = 'asking'`)).toEqual([{ status: 'approved', approved_data: ['members.read', 'bookings.read'] }]);
    // An approval of nothing asked for grants an empty list, not an object.
    await pool.query(`INSERT INTO integrations (id, url) VALUES ('asking-nothing', 'https://asking-nothing.example')`);
    await replay('integrations/approve', { id: 'asking-nothing', approved_data: [] });
    expect(await rows(`SELECT status, approved_data FROM integrations WHERE id = 'asking-nothing'`)).toEqual([{ status: 'approved', approved_data: [] }]);
  });

  it('11 · remove: the row goes, and its actions with it', async () => {
    await replay('integrations/write-bundle', { ...landing('leaving'), actions: [action('leaving', 'roster')] });
    await replay('integrations/write-bundle', { ...landing('staying'), actions: [action('staying', 'roster')] });
    expect(await rows(`SELECT count(*)::int AS n FROM integration_actions WHERE integration_id = 'leaving'`)).toEqual([{ n: 1 }]);
    await replay('integrations/remove', { id: 'leaving' });
    expect(await rows(`SELECT id FROM integrations WHERE id = 'leaving'`)).toEqual([]);
    expect(await rows(`SELECT count(*)::int AS n FROM integration_actions WHERE integration_id = 'leaving'`)).toEqual([{ n: 0 }]);
    // And nobody else's: the one beside it keeps its row and its action.
    expect(await actionsOf('staying')).toHaveLength(1);
    // Removing what is not there writes nothing and throws nothing.
    expect(await replay('integrations/remove', { id: 'ghost' })).toEqual([]);
  });

  it('landing a bundle is all or nothing: a failure part-way leaves the rows of the import before it whole', async () => {
    const bundleOf = (asks: string, names: readonly string[]): Bundle =>
      BundleSchema.parse({ integration: 'atomic', grants: { data: [asks] }, actions: Object.fromEntries(names.map((name) => [`ext.desk.atomic.${name}`, { id: `ext.desk.atomic.${name}`, title: name }])) });
    const landingOf = (bundle: Bundle): BundleImport => ({ id: 'atomic', url: 'https://atomic.example', bundle, extension: undefined, stamp: { 'nisc.nova': 3 } });
    const held = async (): Promise<unknown> => ({
      row: await rows(`SELECT * FROM integrations WHERE id = 'atomic'`),
      actions: await rows(`SELECT * FROM integration_actions WHERE integration_id = 'atomic' ORDER BY action_id`),
    });

    await writeBundle(replay, landingOf(bundleOf('members.read', ['one', 'two'])));
    const before = await held();
    expect(before).toMatchObject({ row: [{ requested_data: ['members.read'] }], actions: [{ action_id: 'ext.desk.atomic.one' }, { action_id: 'ext.desk.atomic.two' }] });

    // The same database, through a client on which the statement that writes
    // the actions fails: the row has been written and the old actions taken
    // out by then.
    const broken = await registryOver(pool, failingAt(pool, /^INSERT INTO integration_actions/));
    await expect(writeBundle(broken, landingOf(bundleOf('bookings.read', ['three'])))).rejects.toThrow(/the database went away/);
    expect(await held()).toEqual(before);

    // ...and the same import lands whole on a client that works.
    await writeBundle(replay, landingOf(bundleOf('bookings.read', ['three'])));
    expect(await held()).toMatchObject({ row: [{ requested_data: ['bookings.read'] }], actions: [{ action_id: 'ext.desk.atomic.three' }] });
  });

  it('two integrations cannot hold the hash of one key, and any number can hold none', async () => {
    await replay('integrations/write-bundle-and-keep-key', { ...landing('twin-a'), key_hash: 'one-hash', actions: [] });
    await expect(replay('integrations/write-bundle-and-keep-key', { ...landing('twin-b'), key_hash: 'one-hash', actions: [] })).rejects.toThrow(/integrations_key_hash_unique/);
    expect(await rows(`SELECT id FROM integrations WHERE key_hash = 'one-hash' OR id = 'twin-b'`)).toEqual([{ id: 'twin-a' }]);
    // A row that holds no key is not held to it: two land with none.
    await replay('integrations/write-bundle', { ...landing('keyless-a'), actions: [] });
    await replay('integrations/write-bundle', { ...landing('keyless-b'), actions: [] });
    expect(await rows(`SELECT id FROM integrations WHERE id IN ('keyless-a', 'keyless-b') AND key_hash IS NULL ORDER BY id`)).toEqual([{ id: 'keyless-a' }, { id: 'keyless-b' }]);
  });

  describe('the lists', () => {
    const start = { after_integration: '', after_action: '' };
    // A LIST SAYS SOMETHING OF EVERY ROW, so these are read from a database
    // that holds the rows written here and no other: what a case above wrote,
    // and in which order they ran, is not among them. Written once, and each
    // case below only reads.
    let pool: PgPool;
    let replay: Replay;
    const rows = async (text: string, values: unknown[] = []): Promise<Record<string, unknown>[]> => (await pool.query(text, values)).rows;

    beforeAll(async () => {
      pool = createPglitePool(freshDatabase());
      replay = await registryOver(pool);
      // Two approved integrations and one that is pending, each with actions
      // and the hash of a key; and an approved one that ships no action.
      const shipped: Record<string, Record<string, unknown>[]> = {
        alpha: [action('alpha', 'roster'), action('alpha', 'board')],
        beta: [action('beta', 'strip'), action('beta', 'other')],
        gamma: [action('gamma', 'roster')],
        delta: [],
      };
      for (const [id, status] of [['alpha', 'approved'], ['beta', 'approved'], ['gamma', 'pending'], ['delta', 'approved']] as const) {
        await replay('integrations/write-bundle-and-keep-key', { ...landing(id), key_hash: `hash-of-${id}`, actions: shipped[id] ?? [] });
        await pool.query('UPDATE integrations SET status = $2 WHERE id = $1', [id, status]);
      }
    });

    it('14 · the approved integration a key hash belongs to, and nobody for a hash that is pending or unknown', async () => {
      expect(await replay('integrations/by-key', { key_hash: 'hash-of-alpha' })).toEqual([{ id: 'alpha' }]);
      expect(await replay('integrations/by-key', { key_hash: 'hash-of-gamma' })).toEqual([]);
      expect(await replay('integrations/by-key', { key_hash: 'nobody' })).toEqual([]);
    });

    it('15 · every integration as the operator sees it, and how many actions each ships', async () => {
      const listed = z.array(z.record(z.string(), z.unknown())).parse(await replay('integrations/list', { after: '' }));
      const counted = z.array(z.object({ integration_id: z.string(), action_count: z.number() })).parse(await replay('integrations/action-counts', { after: '' }));
      const counts = new Map(counted.map((row) => [row.integration_id, row.action_count]));
      const together: Record<string, unknown>[] = listed.map((row) => ({ ...row, action_count: counts.get(String(row['id'])) ?? 0 }));
      // The statement the two entries stand in for: one list, each row with
      // its count, an integration that ships no action counted as none.
      const oracle = await rows(`
        SELECT i.id, i.url, i.status, i.requested_actions, i.requested_data, i.approved_data,
               i.extension, i.last_import_at, i.last_error,
               (SELECT count(*) FROM integration_actions a WHERE a.integration_id = i.id)::int AS action_count
          FROM integrations i ORDER BY i.id`);
      expect(together).toEqual(oracle);
      expect(together.find((row) => row['id'] === 'alpha')?.['action_count']).toBe(2);
      expect(together.find((row) => row['id'] === 'delta')?.['action_count']).toBe(0);
      expect(together.map((row) => row['id'])).toEqual(['alpha', 'beta', 'delta', 'gamma']);
      // The same rows, as the operator's list answers them.
      expect((await listIntegrations(replay)).find((row) => row.id === 'alpha')).toMatchObject({
        url: 'https://alpha.example',
        status: 'approved',
        requestedActions: ['ext.desk.*'],
        requestedData: ['members.read'],
        approvedData: [],
        extension: { listing: { title: 'Belts' } },
        lastError: null,
        actionCount: 2,
      });
      // A page starts after the key it is handed.
      const later = z.array(z.object({ id: z.string() })).parse(await replay('integrations/list', { after: 'beta' }));
      expect(later.map((row) => row.id)).toEqual(['delta', 'gamma']);
      const countedLater = await replay('integrations/action-counts', { after: 'alpha' });
      expect(countedLater).toEqual(await rows(`SELECT integration_id, count(*)::int AS action_count FROM integration_actions WHERE integration_id > 'alpha' GROUP BY integration_id ORDER BY integration_id`));
      expect(countedLater).toContainEqual({ integration_id: 'beta', action_count: 2 });
      expect(countedLater).not.toContainEqual(expect.objectContaining({ integration_id: 'alpha' }));
    });

    it('16 · the stored actions of every approved integration, and a page that starts after an action', async () => {
      const stored = z.array(z.object({ integration_id: z.string(), action_id: z.string(), definition: z.unknown(), grammar: z.unknown() })).parse(await replay('integrations/stored-actions', start));
      expect(stored.map((row) => row.action_id)).toEqual(['ext.desk.alpha.board', 'ext.desk.alpha.roster', 'ext.desk.beta.other', 'ext.desk.beta.strip']);
      expect(stored[0]).toEqual({ integration_id: 'alpha', action_id: 'ext.desk.alpha.board', definition: { id: 'ext.desk.alpha.board', title: 'board' }, grammar: { 'nisc.nova': 3 } });
      const oracle = await rows(
        `SELECT a.action_id, a.definition, a.grammar FROM integration_actions a
           JOIN integrations i ON i.id = a.integration_id
          WHERE i.status = 'approved' ORDER BY a.integration_id, a.action_id`,
      );
      expect(stored.map(({ integration_id: _integration, ...row }) => row)).toEqual(oracle);
      // After the second action of alpha: the rest of that order, across the
      // integration's edge.
      expect(z.array(z.object({ action_id: z.string() })).parse(await replay('integrations/stored-actions', { after_integration: 'alpha', after_action: 'ext.desk.alpha.roster' })).map((row) => row.action_id)).toEqual([
        'ext.desk.beta.other',
        'ext.desk.beta.strip',
      ]);
    });

    it('what one integration shipped, approved or not: what is verified before it is approved', async () => {
      // gamma is pending, so no list above serves its action.
      expect(await replay('integrations/actions-of', { id: 'gamma', ...start })).toEqual([
        { integration_id: 'gamma', action_id: 'ext.desk.gamma.roster', definition: { id: 'ext.desk.gamma.roster', title: 'roster' }, grammar: { 'nisc.nova': 3 } },
      ]);
      expect(z.array(z.object({ action_id: z.string() })).parse(await replay('integrations/actions-of', { id: 'alpha', ...start })).map((row) => row.action_id)).toEqual(['ext.desk.alpha.board', 'ext.desk.alpha.roster']);
      expect(await replay('integrations/actions-of', { id: 'alpha', after_integration: 'alpha', after_action: 'ext.desk.alpha.board' })).toHaveLength(1);
      expect(await replay('integrations/actions-of', { id: 'ghost', ...start })).toEqual([]);
    });
  });
});
