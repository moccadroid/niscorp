import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import type { PgPool, SeedEntry, SeedMutation } from '@niscorp/vex';
import { receiveManifest } from '../src/manifest';
import type { NiscApp } from '../src/manifest';
import { manifestMisfits } from '../src/manifest/schema';
import { serverOver } from '../src/server/server';

// THE MANIFEST IS READ BY A SCHEMA WHEN IT IS HANDED OVER, AND THEN FROZEN.
// Every case but the last is the schema, or the hand-over, over a small object:
// no database and no server. The last one is the order of a boot: that a
// manifest is read before the database is asked anything. It is held on the
// boot itself (`serverOver`, which is `createServer` with the step that
// brings the data module up handed in), with a step that says it was reached
// and a pool that says it was asked. No server is created and no database is
// started. (That an edit throws once `createServer` has RETURNED is proved
// where a server is booted anyway: charter-report.test.ts.)

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
  features: [{ name: 'thing', start: () => undefined }],
  functions: () => ({}),
  onSession: () => undefined,
  runs: () => undefined,
  reactions: [{ table: 'deals', op: 'update', run: () => undefined }],
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

  it('holds a feature to a name and a function to start it with, and leaves what else it carries', () => {
    const calls = { name: 'thing', start: async () => undefined, callThing: () => 'answered', held: { anything: 1 } };
    expect(manifestMisfits({ ...whole(), features: [calls] })).toEqual([]);
    expect(manifestMisfits({ ...whole(), features: [{ name: 'thing' }, { start: () => undefined }, 'thing'] })).toEqual([
      'features.0.start: expected a function',
      'features.1.name: Invalid input: expected string, received undefined',
      'features.2: Invalid input: expected object, received string',
    ]);
    // A field that configured the integrations is not the manifest's any more.
    expect(manifestMisfits({ ...whole(), menuSlots: ['home'] })).toEqual(['(the manifest): Unrecognized key: "menuSlots"']);
  });

  // The write-fact bridge was three functions under `facts`. It is a feature
  // (`createTideFacts`, from `@niscorp/moss/tide`), so a manifest that still
  // names the field is told, at boot, and not served with the bridge silently
  // gone.
  it('refuses `facts`, which configured what is a feature now', () => {
    expect(manifestMisfits({ ...whole(), facts: { tide: () => undefined, identity: () => undefined } })).toEqual(['(the manifest): Unrecognized key: "facts"']);
  });

  it('holds a canvas, a page and the lists to their shapes', () => {
    const misfits = manifestMisfits({
      ...whole(),
      shell: { canvases: [{ id: 'main', mode: 'pile' }, { id: 'tray', initial: [{ input: {} }] }] },
      pages: { about: { canvases: [] } },
      features: 'thing',
      assignments: { usr_1: 'member' },
    });
    expect(misfits).toEqual([
      'assignments.usr_1: Invalid input: expected array, received string',
      'features: Invalid input: expected array, received string',
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

describe('the hand-over freezes what it read', () => {
  it('every way of editing the manifest throws, at every depth', () => {
    const entries: (SeedEntry | SeedMutation)[] = [{ fingerprint: 'deals/open', dsl: { from: ['deals'], fields: ['deals.id'] } }];
    const layout: LayoutNode = { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', children: 'one' }] };
    const board: ActionDefinition = { id: 'board', layout, data: { rows: [] } };
    const app: NiscApp = { ...whole(), actions: { board }, entries };

    receiveManifest(app);

    // A field of the manifest itself, put in place of what was handed over.
    expect(() => {
      app.actions = {};
    }).toThrow(TypeError);
    expect(() => {
      app.charter = { public: [] };
    }).toThrow(TypeError);
    // A record it holds: one more, one fewer.
    expect(() => {
      app.actions['lobby'] = { id: 'lobby' };
    }).toThrow(TypeError);
    expect(() => {
      delete app.actions['board'];
    }).toThrow(TypeError);
    expect(() => {
      app.charter['member'] = ['board'];
    }).toThrow(TypeError);
    // A list it holds, through the reference the app kept.
    expect(() => entries.push({ fingerprint: 'deals/all', dsl: { from: ['deals'], fields: ['deals.id'] } })).toThrow(TypeError);
    // And all the way down: a definition, its data, a node of its layout.
    expect(() => {
      board.title = 'Board';
    }).toThrow(TypeError);
    expect(() => {
      Object.assign(board.data ?? {}, { rows: [1] });
    }).toThrow(TypeError);
    expect(() => {
      Object.assign(layout, { component: 'Row' });
    }).toThrow(TypeError);
    expect(Object.isFrozen(app.shell?.canvases[0])).toBe(true);
    expect(Object.isFrozen(app.pages?.['about'])).toBe(true);

    expect(app.actions).toEqual({ board: { id: 'board', layout: { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', children: 'one' }] }, data: { rows: [] } } });
    expect(entries).toHaveLength(1);
  });

  it('a seam and a kit’s own object are not frozen: they are code, with state of their own', () => {
    // A kit hands a component's props over as a zod schema, and a zod schema
    // writes onto itself as it is used: frozen, its first parse throws.
    const propsSchema = z.object({ gap: z.number().optional() }).strict();
    const inputs = (): Record<string, Record<string, unknown>> => ({});
    const meta = { description: 'a stack', propsSchema };
    const app: NiscApp = { ...whole(), shell: { canvases: [], components: { Stack: { meta } }, inputs } };

    receiveManifest(app);

    expect(Object.isFrozen(meta)).toBe(true);
    expect(Object.isFrozen(propsSchema)).toBe(false);
    expect(Object.isFrozen(inputs)).toBe(false);
    expect(propsSchema.safeParse({ gap: 2 }).success).toBe(true);
  });

  it('a manifest that is refused is left as it was, and one that was taken may be handed over again', () => {
    const refused: NiscApp = JSON.parse(JSON.stringify({ charter: {}, actions: { home: { id: 'home', tittle: 'Home' } } }));
    expect(() => receiveManifest(refused)).toThrow(/^The manifest does not parse/);
    expect(Object.isFrozen(refused)).toBe(false);
    expect(Object.isFrozen(refused.actions)).toBe(false);

    // Two servers over one manifest, or two manifests sharing a definition.
    const app = whole();
    receiveManifest(app);
    expect(() => receiveManifest(app)).not.toThrow();
    expect(() => receiveManifest({ ...whole(), actions: app.actions })).not.toThrow();
  });
});

describe('a boot — a manifest that does not parse', () => {
  it('refuses with every place that does not fit, before the data module is brought up and before the database is asked anything', async () => {
    const reached: string[] = [];
    const pool: PgPool = {
      query: async (sql: string) => {
        reached.push(`the database was asked: ${sql}`);
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

    const booting = serverOver(handed, { pool, db: pool, session: 'dev-open' }, async () => {
      reached.push('the data module was brought up');
      throw new Error('the data module was brought up before the manifest was read');
    });

    await expect(booting).rejects.toThrow(
      /^The manifest does not parse — refusing to serve:\n {2}actions\.panel\.layout\.component: Invalid input: expected string, received number\n {2}shell\.inputs: expected a function$/,
    );
    expect(reached).toEqual([]);
  });

  it('one that parses goes on to the step that brings the data module up', async () => {
    const reached: string[] = [];
    const pool: PgPool = { query: async () => ({ rows: [] }) };
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const booting = serverOver({ charter: { public: ['home'] }, actions: { home, panel } }, { pool, db: pool, session: 'dev-open' }, async () => {
        reached.push('the data module was brought up');
        throw new Error('and that is as far as this goes');
      });
      await expect(booting).rejects.toThrow('and that is as far as this goes');
      expect(reached).toEqual(['the data module was brought up']);
    } finally {
      said.mockRestore();
    }
  });
});
