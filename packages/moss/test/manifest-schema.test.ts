import { describe, it, expect } from 'vitest';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import type { PgPool } from '@niscorp/vex';
import { receiveManifest } from '../src/manifest';
import type { NiscApp } from '../src/manifest';
import { manifestMisfits } from '../src/manifest/schema';
import { createServer } from '../src/server';

// THE MANIFEST IS READ BY A SCHEMA WHEN IT IS HANDED OVER. Every case but the
// last is the schema alone, over a small object: no database and no server.
// The last one calls `createServer`, because what it proves is about
// `createServer`: that it refuses before it touches the database it was given.
// That database is a pool that fails the test if it is asked anything.

const plain: LayoutNode = { component: 'Text', children: 'plain' };
const home: ActionDefinition = { id: 'home', layout: plain, triggers: [{ event: 'ui:click', ref: 'open', do: [{ push: { action: 'panel' } }] }] };
const panel: ActionDefinition = { id: 'panel' };

// Every field of a manifest, each holding what its type says.
const whole = (): NiscApp => ({
  charter: { public: ['home'], member: { actions: ['home', 'panel'], data: ['deals.read'], layouts: ['home.*'] } },
  assignments: { usr_1: ['member'] },
  wearable: [['member']],
  actions: { home, panel },
  layouts: { 'home.dense': { action: 'home', layout: plain } },
  behaviors: { deals: { read: [{ match: 'owner_id', to: 'userId' }] } },
  entries: [
    { fingerprint: 'deals/open', intent: 'Open deals', shape: [{ id: '' }], dsl: { from: ['deals'], fields: ['deals.id'], limit: 50 }, mapping: { $ref: '$.result' }, reach: 'own', refresh: 'reactive' },
    { fingerprint: 'deals/close', mutation: { op: 'update', table: 'deals', set: { open: false }, where: { eq: ['deals.id', { $context: 'id' }] } } },
  ],
  resources: { deals: ['deals'], crm: { entities: ['deals'] } },
  shell: {
    canvases: [{ id: 'main', initial: ['home', { action: 'panel', input: { open: true }, with: ['sheet'] }] }, { id: 'tray', mode: 'list', actionLayout: plain }],
    layout: { component: 'CanvasSlot', props: { canvas: 'main' } },
    layoutStore: { dock: plain },
    fragments: { sheet: { kind: 'fragment', id: 'sheet', layout: { slot: 'body' } } },
    components: { Text: { meta: { description: 'words' } }, Card: {} },
    inputs: () => ({}),
    seeds: async () => ({}),
  },
  pages: { about: { path: '/about/:slug', params: 'main', canvases: [{ id: 'main', initial: 'home' }] } },
  grammars: [{ id: 'app.kit', documents: {}, migrations: [] }],
  scope: () => ({}),
  identity: { as: 'identity', resolve: async () => ({ roles: ['member'], scope: {} }) },
  phrases: () => undefined,
  phraseKeys: { props: ['label'], suffixes: ['_display'], text: true },
  installedIntegrations: () => [],
  integrationActor: () => null,
  attachable: { home: { deal_id: 'dealId' } },
  menuSlots: ['home'],
  assistantTools: ['search'],
  publishChecks: ['links'],
  editorRegions: ['panel'],
  placementNames: { home: 'the home' },
  storePress: async () => '/press/a.png',
  functions: () => ({}),
  onSession: () => undefined,
  runs: () => undefined,
  reactions: [{ table: 'deals', op: 'update', run: () => undefined }],
  facts: { tide: () => undefined, identity: () => undefined, chain: () => undefined },
});

describe('the manifest’s schema', () => {
  it('reads a manifest that holds every field', () => {
    expect(manifestMisfits(whole())).toEqual([]);
    expect(() => receiveManifest(whole())).not.toThrow();
  });

  it('reads the smallest manifest there is', () => {
    expect(manifestMisfits({ charter: {}, actions: {} })).toEqual([]);
  });

  it('holds an action, a layout and a fragment to nova’s schemas, and says where', () => {
    const misfits = manifestMisfits({
      ...whole(),
      actions: { home: { ...home, tittle: 'Home' }, panel: { id: 'panel', layout: { component: 7 } } },
      layouts: { 'home.dense': { action: 'home', layout: { component: 'Text', childs: [] } } },
      shell: { canvases: [{ id: 'main' }], fragments: { sheet: { id: 'sheet' } } },
    });
    expect(misfits).toEqual([
      'actions.home: Unrecognized key: "tittle"',
      // A layout node is a union: the branch that was meant is the one named.
      'actions.panel.layout.component: Invalid input: expected string, received number',
      'layouts.home.dense.layout: Unrecognized key: "childs"',
      'shell.fragments.sheet.kind: Invalid input: expected "fragment"',
    ]);
  });

  it('holds an entry to vex’s schemas: a read to a query, a write to a mutation', () => {
    const misfits = manifestMisfits({
      ...whole(),
      entries: [
        { fingerprint: 'deals/none', dsl: { from: ['deals'] } },
        { fingerprint: 'deals/drop', mutation: { op: 'drop', table: 'deals' } },
        { fingerprint: 'deals/stale', dsl: { from: ['deals'], fields: ['deals.id'] }, refresh: 'hourly' },
        { fingerprint: 'deals/both', dsl: { from: ['deals'], fields: ['deals.id'] }, mutation: { op: 'delete', table: 'deals', where: { eq: ['deals.id', 1] } } },
      ],
    });
    expect(misfits).toEqual([
      'entries.0.dsl: A query must select at least one of `fields` or `aggregate`.',
      "entries.1.mutation.op: Invalid discriminator value. Expected 'insert' | 'insertEach' | 'update' | 'delete' | 'upsert'",
      'entries.2.refresh: Invalid option: expected one of "snapshot"|"reactive"',
      'entries.3: Unrecognized key: "mutation"',
    ]);
  });

  it('holds a canvas, a page and the lists to their shapes', () => {
    const misfits = manifestMisfits({
      ...whole(),
      shell: { canvases: [{ id: 'main', mode: 'pile' }, { id: 'tray', initial: [{ input: {} }] }] },
      pages: { about: { canvases: [] } },
      menuSlots: 'home',
      assignments: { usr_1: 'member' },
    });
    expect(misfits).toEqual([
      'assignments.usr_1: Invalid input: expected array, received string',
      'menuSlots: Invalid input: expected array, received string',
      'shell.canvases.0.mode: Invalid option: expected one of "stack"|"list"',
      'shell.canvases.1.initial.0.action: Invalid input: expected string, received undefined',
      'pages.about.path: Invalid input: expected string, received undefined',
    ]);
  });

  it('holds a seam to being a function', () => {
    const misfits = manifestMisfits({
      ...whole(),
      scope: { tenant: 'north' },
      identity: { as: 'identity' },
      shell: { canvases: [], inputs: 'the inputs' },
      reactions: [{ table: 'deals', run: 'deals-changed' }],
    });
    expect(misfits).toEqual(['scope: expected a function', 'identity.resolve: expected a function', 'shell.inputs: expected a function', 'reactions.0.run: expected a function']);
  });

  it('names a field no manifest has, and a manifest that has no actions', () => {
    expect(manifestMisfits({ ...whole(), layout: {} })).toEqual(['(the manifest): Unrecognized key: "layout"']);
    expect(manifestMisfits({ charter: {} })).toEqual(['actions: Invalid input: expected record, received undefined']);
    expect(manifestMisfits(undefined)).toEqual(['(the manifest): Invalid input: expected object, received undefined']);
  });

  it('leaves a component’s contract to the kit that wrote it', () => {
    const kit = { Text: { component: () => null, meta: { description: 'words', propsSchema: { type: 'object' }, events: { press: {} } } } };
    expect(manifestMisfits({ ...whole(), shell: { canvases: [], components: kit } })).toEqual([]);
    expect(manifestMisfits({ ...whole(), shell: { canvases: [], components: { Text: { meta: { description: 7 } } } } })).toEqual([
      'shell.components.Text.meta.description: Invalid input: expected string, received number',
    ]);
  });

  it('refuses a document that nests too deep with a sentence, where a recursive schema would overflow the stack', () => {
    let deep: LayoutNode = 'leaf';
    for (let level = 0; level < 5000; level += 1) deep = { component: 'Box', children: [deep] };
    const misfits = manifestMisfits({ ...whole(), actions: { home: { id: 'home', layout: deep } } });
    expect(misfits).toHaveLength(1);
    expect(misfits[0]).toMatch(/^actions\.home: the document nests deeper than 256 levels/);
  });
});

describe('createServer — a manifest that does not parse', () => {
  it('refuses with every place that does not fit, before the database is asked anything', async () => {
    const asked: string[] = [];
    const pool: PgPool = {
      query: async (sql: string) => {
        asked.push(sql);
        throw new Error('the database was asked before the manifest was read');
      },
    };
    // Typed as a manifest and not one: what `JSON.parse` hands over.
    const handed: NiscApp = JSON.parse(
      JSON.stringify({
        charter: { public: ['home'] },
        actions: { home, panel: { id: 'panel', layout: { component: 7 } } },
        shell: { canvases: [], inputs: 'the inputs' },
      }),
    );

    await expect(createServer(handed, { pool, db: pool, session: 'dev-open' })).rejects.toThrow(
      /^The manifest does not parse — refusing to serve:\n {2}actions\.panel\.layout\.component: Invalid input: expected string, received number\n {2}shell\.inputs: expected a function$/,
    );
    expect(asked).toEqual([]);
  });
});
