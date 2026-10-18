import { describe, it, expect, vi } from 'vitest';
import { scopeGrants } from '@niscorp/vex';
import type { CacheEntry, Query, SeedEntry } from '@niscorp/vex';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { compile } from '@niscorp/prism';
import { createRunningManifest, savedRowsOver } from '../src/artifactory';
import type { RunningManifest } from '../src/artifactory';
import { createGrammarUpgrader } from '../src/data/engine';
import type { NiscApp, SessionArtifacts, ShellManifest } from '../src/manifest';
import { rowsDouble } from './saved-double';

const saying = (text: string): LayoutNode => ({ component: 'Text', children: text });
const home: ActionDefinition = { id: 'home', layout: saying('home') };
const openDeals: SeedEntry = { fingerprint: 'deals/open', dsl: { from: ['deals'], fields: ['deals.id'] } };
const SHELL: ShellManifest = { canvases: [{ id: 'main', initial: 'home' }] };
const app: NiscApp = { charter: { public: ['home'], member: { actions: ['home'] } }, actions: { home }, entries: [openDeals], shell: SHELL };

const named: Query = { from: ['deals'], fields: ['deals.id', 'deals.title'] };
const mapping = { $ref: '$.result' };

// What vex wrote for a request: the hash of the request, and the config its mapping was compiled from.
const writtenFor = async (dsl: Query, more: Partial<Extract<CacheEntry, { kind: 'ok' }>> = {}): Promise<CacheEntry> => ({
  kind: 'ok',
  dsl,
  prismIr: await compile(mapping),
  mapping,
  shape: [{ id: 0, title: '' }],
  intent: 'the deals, by title',
  requestHash: 'h_1',
  createdAt: 1,
  ...more,
});

const world = async () => {
  const rows = rowsDouble();
  const vexTable = new Map<string, CacheEntry>([
    ['fp_written', await writtenFor(named)],
    ['fp_unmapped', await writtenFor(named, { mapping: undefined })],
    ['fp_seeded', { ...(await writtenFor(named)), requestHash: undefined, protected: true }],
    ['fp_gone', await writtenFor({ from: ['deals'], fields: ['deals.gone'] })],
  ]);
  // The schema as vex compiles against it: a dropped column is a query that does not run.
  const dropped = new Set(['deals.gone']);
  const compileQuery = (dsl: Query): void => {
    const missing = (dsl.fields ?? []).find((field) => typeof field === 'string' && dropped.has(field));
    if (missing !== undefined) throw new Error(`Unknown field "${missing}"`);
  };
  const running: RunningManifest = createRunningManifest({
    shipped: app,
    grants: scopeGrants([]),
    shells: [SHELL],
    reads: { written: async (fingerprint) => vexTable.get(fingerprint), compile: compileQuery, savedOf: (scope) => rows.as(String(scope['userId'])) },
  });
  const of = (principal: string): SessionArtifacts =>
    running.sessionArtifacts(principal, async () => ({ roles: ['member'], installed: undefined, saved: rows.as(principal), replayable: async () => ['deals/open'] }));
  const shellOf = (principal: string) => running.artifactsFor(SHELL, { principal, roles: ['member'], installed: undefined, saved: rows.as(principal), replayable: async () => ['deals/open'] });
  return { running, rows, vexTable, dropped, of, shellOf };
};

const read = (id?: string, body?: unknown): { kind: 'read'; id?: string; body: unknown } => ({ kind: 'read', ...(id === undefined ? {} : { id }), body });
const replaying = (fingerprint: string): { kind: 'action'; body: unknown } => ({
  kind: 'action',
  body: { data: { rows: [] }, endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint }, target: 'rows' } }, lifecycle: { mount: [{ call: 'load' }] }, layout: saying('the deals') },
});

describe('a read vex wrote for a request, saved from a session', () => {
  it('is kept under the fingerprint vex gave it, as it was written: the query and its mapping’s prism config', async () => {
    const { of } = await world();
    const saved = await of('ada').save([read('fp_written')]);

    expect(saved.artifacts).toEqual([{ kind: 'read', id: 'fp_written' }]);
    expect((await of('ada').list('read')).map((version) => [version.id, version.body])).toEqual([
      ['fp_written', { dsl: named, mapping, shape: [{ id: 0, title: '' }], intent: 'the deals, by title' }],
    ]);
  });

  it('is answered, compiled, to the person who saved it and to nobody else', async () => {
    const { of, running } = await world();
    await of('ada').save([read('fp_written')]);

    const adas = await running.cacheEntry('fp_written', { userId: 'ada' });
    expect(adas?.kind).toBe('ok');
    expect(adas !== undefined && adas.kind === 'ok' ? adas.dsl : undefined).toEqual(named);
    expect(adas !== undefined && adas.kind === 'ok' ? adas.prismIr : undefined).toBeDefined();
    expect(await running.cacheEntry('fp_written', { userId: 'ben' })).toBeUndefined();
    expect(await running.cacheEntry('fp_written')).toBeUndefined();
  });

  it('is answered as a query vex wrote is, held to vex’s limits: an entry the app ships is protected, and a saved read is not', async () => {
    const { of, running } = await world();
    await of('ada').save([read('fp_written')]);

    expect(await running.cacheEntry('fp_written', { userId: 'ada' })).not.toHaveProperty('protected');
    expect(await running.cacheEntry('deals/open', { userId: 'ada' })).toMatchObject({ protected: true });
  });

  it('is answered to no caller nobody is signed in for, though a principal shares their id', async () => {
    const { of, running } = await world();
    await of('anonymous').save([read('fp_written')]);

    expect(await running.cacheEntry('fp_written', { userId: 'anonymous' })).toBeUndefined();
  });

  it('a reset one is brought back by going back to its version, though vex’s table lost it', async () => {
    const { of, running, vexTable } = await world();
    const first = await of('ada').save([read('fp_written')]);
    vexTable.delete('fp_written');
    await of('ada').reset('read', 'fp_written');
    expect(await running.cacheEntry('fp_written', { userId: 'ada' })).toBeUndefined();

    await of('ada').restore('read', 'fp_written', first.save);

    expect((await running.cacheEntry('fp_written', { userId: 'ada' }))?.kind).toBe('ok');
  });

  it('survives what vex’s own table loses, and a reset takes it back', async () => {
    const { of, running, vexTable } = await world();
    const saved = await of('ada').save([read('fp_written')]);
    vexTable.delete('fp_written');

    expect((await running.cacheEntry('fp_written', { userId: 'ada' }))?.kind).toBe('ok');

    await of('ada').reset('read', saved.artifacts[0]?.id ?? '');
    expect(await running.cacheEntry('fp_written', { userId: 'ada' })).toBeUndefined();
  });

  it('once the schema no longer has what it reads, is left out with a line, and so is a generated action that replays it', async () => {
    const { of, shellOf, dropped } = await world();
    await of('ada').save([read('fp_written')]);
    const action = await of('ada').save([replaying('fp_written')]);
    const id = action.artifacts[0]?.id ?? '';
    expect(Object.keys((await shellOf('ada')).actions)).toContain(id);

    dropped.add('deals.title');
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(Object.keys((await shellOf('ada')).actions)).not.toContain(id);
      expect(said).toHaveBeenCalledWith('[moss] the read "fp_written" of ada is left out: Unknown field "deals.title"');
    } finally {
      said.mockRestore();
    }
  });

  it('a generated action may replay a read its owner saved, and not one somebody else saved', async () => {
    const { of } = await world();
    await of('ada').save([read('fp_written')]);

    await expect(of('ada').save([replaying('fp_written')])).resolves.toBeDefined();
    await expect(of('ben').save([replaying('fp_written')])).rejects.toThrow(
      'moss: the action is refused: endpoint "load" replays "fp_written", which is no entry the app ships or was handed, nor a read its owner saved',
    );
  });

  it('a draft takes one, and an action in the same draft may replay it', async () => {
    const { running } = await world();
    const draft = running.draftSavingFor(SHELL, 'ada', async () => ({ roles: ['member'], installed: undefined, saved: rowsDouble().as('ada'), replayable: async () => ['deals/open'] }));
    const added = await draft.add([read('fp_written')], []);
    expect(added.added).toEqual([{ kind: 'read', id: 'fp_written' }]);

    const both = await draft.add([replaying('fp_written')], added.drafted);
    await expect(draft.save(both.drafted)).resolves.toBeDefined();
  });
});

describe('what is refused of a read, in a sentence, with nothing written', () => {
  const refused = async (asked: ReturnType<typeof read>, sentence: string): Promise<void> => {
    const { of, rows } = await world();
    await expect(of('ada').save([asked])).rejects.toThrow(sentence);
    expect(rows.rows).toEqual([]);
  };

  it('one with no id: a read is named by the fingerprint vex gave it', () => refused(read(), 'moss: a read is saved under the fingerprint vex gave it: name it as the id.'));

  it('one with a body: it is what vex wrote', () =>
    refused(read('fp_written', { dsl: named }), 'moss: the read "fp_written" is refused: it is what vex wrote for the request. Leave the body out.'));

  it('one under the fingerprint of an entry the app ships', () =>
    refused(read('deals/open'), 'moss: the read "deals/open" is refused: "deals/open" is the fingerprint of an entry the app ships or was handed, and a read somebody generated never answers in its place'));

  it('one vex wrote for no request: nothing, or an entry put there by hand', async () => {
    await refused(read('fp_nowhere'), 'moss: the read "fp_nowhere" is refused: vex holds no query it wrote under "fp_nowhere"');
    await refused(read('fp_seeded'), 'moss: the read "fp_seeded" is refused: vex holds no query it wrote under "fp_seeded"');
  });

  it('one whose mapping vex kept no config for', () =>
    refused(read('fp_unmapped'), 'moss: the read "fp_unmapped" is refused: vex kept no prism config for the mapping of "fp_unmapped": it was written before vex kept one. Ask for it again.'));

  it('one that does not run against the schema', () => refused(read('fp_gone'), 'moss: the read "fp_gone" is refused: Unknown field "deals.gone"'));
});

describe('a running manifest no read is saved through', () => {
  it('has no read among the kinds a session saves', async () => {
    const running = createRunningManifest({ shipped: app, grants: scopeGrants([]), shells: [SHELL] });
    const rows = rowsDouble();
    const of = running.sessionArtifacts('ada', async () => ({ roles: ['member'], installed: undefined, saved: rows.as('ada') }));
    await expect(of.save([read('fp_written')])).rejects.toThrow('moss: "read" is not a kind that is saved. The kinds: layout, action, fragment.');
    expect(await running.cacheEntry('fp_written', { userId: 'ada' })).toBeUndefined();
  });
});

describe('what was saved under another grammar of vex’s', () => {
  it('is read where it was written at the grammar this server runs, and not where it was written under a newer one', async () => {
    const at = (grammar: Record<string, number>) => ({ save: '0b0e7a52-6f0e-4b8e-9d0c-1f2e3a4b5c6d', kind: 'read', id: 'fp_written', body: { dsl: named, mapping }, grammar, copied_from: null, created_at: new Date(0) });
    const upgrader = await createGrammarUpgrader({});
    const inForceAt = async (grammar: Record<string, number>) => (await savedRowsOver(async () => [at(grammar)], upgrader).of({ userId: 'ada' }).inForce())[0];

    expect((await inForceAt({ 'nisc.vex': 0 }))?.unread).toBeUndefined();
    expect((await inForceAt({ 'nisc.vex': 9999 }))?.unread).toEqual(expect.any(String));
  });
});
