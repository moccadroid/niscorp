import { describe, it, expect } from 'vitest';
import { createUpgrader, prepare, type Sequence, type Stamp, type Transform } from '../src';
import { migrate } from '../src/postgres';

// A grammar shaped like nova's: an action holds a layout and endpoint configs;
// a layout holds layouts wherever a node nests them.
const nova = (migrations: Sequence['migrations'] = []): Sequence => ({
  id: 'nisc.nova',
  documents: {
    action: { embeds: { layout: 'nisc.nova/layout', 'endpoints.*.request': 'nisc.prism/config' } },
    layout: { embeds: { children: 'nisc.nova/layout', 'children[]': 'nisc.nova/layout', then: 'nisc.nova/layout', else: 'nisc.nova/layout', do: 'nisc.nova/layout' } },
  },
  migrations,
});
const prism = (migrations: Sequence['migrations'] = []): Sequence => ({ id: 'nisc.prism', documents: { config: {} }, migrations });

const action = {
  id: 'people.list',
  layout: {
    component: 'Stack',
    children: [
      { component: 'Button', props: { label: 'Add' } },
      { if: '$.admin', then: { component: 'Button', props: { label: 'Delete' } }, else: { component: 'Text' } },
      { for: '$.rows', as: 'row', do: { component: 'Card', children: { component: 'Button', props: { label: 'Open' } } } },
    ],
  },
  endpoints: { load: { url: '/x', request: { q: { $ref: '$.q' } } } },
};

// The injected evaluator. Under moss this is Prism's `evaluate` over a Prism
// config; here the config IS a function, which is all strata needs to know.
const transform: Transform = (config, source) => {
  if (typeof config !== 'function') throw new Error('not a test transform');
  return config(source);
};
const step = (at: string, fn: (source: { document: Record<string, unknown>; path: string }) => unknown) => ({ kind: 'document' as const, at, transform: fn });

// Button's `label` prop is now `text` — one flat node at a time.
const renameLabel = step('nisc.nova/layout', ({ document }) => {
  const props = document['props'];
  if (document['component'] !== 'Button' || typeof props !== 'object' || props === null || !('label' in props)) return document;
  const { label, ...rest } = props as Record<string, unknown>;
  return { ...document, props: { ...rest, text: label } };
});

describe('locate — the grammar finds its documents', () => {
  it('finds every layout at any depth — array children, a lone child, then/else, do — and the Prism config', async () => {
    const upgrader = await createUpgrader([nova(), prism()], { transform });
    const found = upgrader.locate(action, 'nisc.nova/action').map((l) => `${l.kind} @ ${l.path.join('.') || '(root)'}`);
    expect(found).toEqual([
      'nisc.nova/action @ (root)',
      'nisc.nova/layout @ layout',
      'nisc.nova/layout @ layout.children.0',
      'nisc.nova/layout @ layout.children.1',
      'nisc.nova/layout @ layout.children.1.then',
      'nisc.nova/layout @ layout.children.1.else',
      'nisc.nova/layout @ layout.children.2',
      'nisc.nova/layout @ layout.children.2.do',
      'nisc.nova/layout @ layout.children.2.do.children',
      'nisc.prism/config @ endpoints.load.request',
    ]);
  });

  it('a lone child node is ONE layout — its props are not mistaken for layouts', async () => {
    const upgrader = await createUpgrader([nova(), prism()], { transform });
    const lone = { component: 'Card', children: { component: 'Text', props: { label: { component: 'NotALayout' } } } };
    expect(upgrader.locate(lone, 'nisc.nova/layout').map((l) => l.path.join('.'))).toEqual(['', 'children']);
  });
});

describe('upgrade — a document catches up to the code', () => {
  it('runs a flat migration on every node of its kind, at every depth, and stamps the result current', async () => {
    const upgrader = await createUpgrader([nova([{ description: 'Button label → text', steps: [renameLabel] }]), prism()], { transform });
    const { document, stamp, applied } = upgrader.upgrade(action, { kind: 'nisc.nova/action', stamp: { 'nisc.nova': 0, 'nisc.prism': 0 } });
    expect(applied).toEqual(['nisc.nova/1']);
    expect(stamp).toEqual({ 'nisc.nova': 1, 'nisc.prism': 0 });
    const texts = JSON.stringify(document).match(/"text":"[A-Za-z]+"/g);
    expect(texts).toEqual(['"text":"Add"', '"text":"Delete"', '"text":"Open"']);
    expect(JSON.stringify(document)).not.toContain('"label"');
  });

  it('never mutates what it was given', async () => {
    const upgrader = await createUpgrader([nova([{ description: 'rename', steps: [renameLabel] }]), prism()], { transform });
    const before = JSON.stringify(action);
    upgrader.upgrade(action, { kind: 'nisc.nova/action', stamp: {} });
    expect(JSON.stringify(action)).toBe(before);
  });

  it('a current document is returned untouched, with nothing applied', async () => {
    const upgrader = await createUpgrader([nova([{ description: 'rename', steps: [renameLabel] }]), prism()], { transform });
    const result = upgrader.upgrade(action, { kind: 'nisc.nova/action', stamp: { 'nisc.nova': 1 } });
    expect(result.applied).toEqual([]);
    expect(result.document).toBe(action);
  });

  // A stamp can name a grammar this code was not given — a kit the reader does not
  // have. That entry is the document's own record of it: an upgrade that drops it
  // lets code that does have the grammar run its migrations a second time.
  it('keeps the stamp entries of grammars it was not given', async () => {
    const upgrader = await createUpgrader([nova([{ description: 'rename', steps: [renameLabel] }]), prism()], { transform });

    const behind = upgrader.upgrade(action, { kind: 'nisc.nova/action', stamp: { 'nisc.nova': 0, 'acme.kit': 3 } });
    expect(behind.applied).toEqual(['nisc.nova/1']);
    expect(behind.stamp).toEqual({ 'nisc.nova': 1, 'nisc.prism': 0, 'acme.kit': 3 });

    const current = upgrader.upgrade(action, { kind: 'nisc.nova/action', stamp: { 'nisc.nova': 1, 'acme.kit': 3 } });
    expect(current.applied).toEqual([]);
    expect(current.stamp).toEqual({ 'nisc.nova': 1, 'nisc.prism': 0, 'acme.kit': 3 });
  });

  it('hands back its own stamp when the document names no grammar but its own', async () => {
    const upgrader = await createUpgrader([nova([{ description: 'rename', steps: [renameLabel] }]), prism()], { transform });
    expect(upgrader.stamp).toEqual({ 'nisc.nova': 1, 'nisc.prism': 0 });
    const stamps: readonly (Stamp | null)[] = [{ 'nisc.nova': 0 }, { 'nisc.nova': 1, 'nisc.prism': 0 }, {}, null];
    for (const stamp of stamps) {
      expect(upgrader.upgrade(action, { kind: 'nisc.nova/action', stamp }).stamp).toBe(upgrader.stamp);
    }
  });

  it('a grammar it was not given is never ahead of it, and never makes a document behind', async () => {
    const upgrader = await createUpgrader([nova([{ description: 'rename', steps: [renameLabel] }]), prism()], { transform });
    expect(upgrader.behind({ 'nisc.nova': 1, 'nisc.prism': 0, 'acme.kit': 99 })).toBe(false);
  });

  it('no stamp means "before the grammar had migrations" — everything runs', async () => {
    const upgrader = await createUpgrader([nova([{ description: 'rename', steps: [renameLabel] }]), prism()], { transform });
    expect(upgrader.upgrade(action, { kind: 'nisc.nova/action', stamp: null }).applied).toEqual(['nisc.nova/1']);
  });

  it('a document written by newer code is TOO_NEW — never guessed at', async () => {
    const upgrader = await createUpgrader([nova(), prism()], { transform });
    expect(() => upgrader.upgrade(action, { kind: 'nisc.nova/action', stamp: { 'nisc.nova': 2 } })).toThrow(expect.objectContaining({ code: 'TOO_NEW' }));
  });

  it('deepest first: a parent\'s rewrite sees its children already rewritten', async () => {
    const seen: string[] = [];
    const tag = step('nisc.nova/layout', ({ document }) => {
      seen.push(String(document['component']));
      const child = document['children'];
      const childDone = typeof child === 'object' && child !== null && !Array.isArray(child) && (child as Record<string, unknown>)['done'] === true;
      return { ...document, done: true, sawChildDone: childDone };
    });
    const upgrader = await createUpgrader([nova([{ description: 'tag', steps: [tag] }]), prism()], { transform });
    const doc = { component: 'Outer', children: { component: 'Inner' } };
    const { document } = upgrader.upgrade(doc, { kind: 'nisc.nova/layout' });
    expect(seen).toEqual(['Inner', 'Outer']);
    expect(document['sawChildDone']).toBe(true);
  });

  it('orders across grammars: a nova migration that waits on prism/1 runs after it', async () => {
    const order: string[] = [];
    const mark = (name: string, at: string) => step(at, ({ document }) => (order.push(name), document));
    const upgrader = await createUpgrader(
      [
        nova([{ description: 'needs prism/1', steps: [mark('nova', 'nisc.nova/action')], dependsOn: ['nisc.prism/1'] }]),
        prism([{ description: 'prism change', steps: [mark('prism', 'nisc.prism/config')] }]),
      ],
      { transform },
    );
    expect(upgrader.upgrade(action, { kind: 'nisc.nova/action' }).applied).toEqual(['nisc.prism/1', 'nisc.nova/1']);
    expect(order).toEqual(['prism', 'nova']);
  });

  it('an app\'s own grammar can migrate nodes of nova\'s kind — a kit renaming its component\'s props', async () => {
    const kit: Sequence = { id: 'acme.kit', documents: {}, migrations: [{ description: 'Button label → text', steps: [renameLabel] }] };
    const upgrader = await createUpgrader([nova(), prism(), kit], { transform });
    const { applied, stamp } = upgrader.upgrade(action, { kind: 'nisc.nova/action', stamp: { 'nisc.nova': 0 } });
    expect(applied).toEqual(['acme.kit/1']);
    expect(stamp).toEqual({ 'nisc.nova': 0, 'nisc.prism': 0, 'acme.kit': 1 });
  });
});

describe('upgrade — refusals', () => {
  it('a transform that throws is STEP_FAILED, naming the migration and where', async () => {
    const boom = step('nisc.nova/layout', ({ document }) => {
      if (document['component'] === 'Text') throw new Error('cannot read Text');
      return document;
    });
    const upgrader = await createUpgrader([nova([{ description: 'boom', steps: [boom] }]), prism()], { transform });
    const error = (() => {
      try {
        upgrader.upgrade(action, { kind: 'nisc.nova/action' });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toMatchObject({ code: 'STEP_FAILED' });
    expect(String(error)).toContain('layout.children[1].else');
  });

  it('a transform that returns something other than a document is STEP_FAILED', async () => {
    const upgrader = await createUpgrader([nova([{ description: 'bad', steps: [step('nisc.nova/layout', () => null)] }]), prism()], { transform });
    expect(() => upgrader.upgrade(action, { kind: 'nisc.nova/action' })).toThrow(expect.objectContaining({ code: 'STEP_FAILED' }));
  });

  it('a kind nobody declares is UNKNOWN_KIND — as a step target or an embedding', async () => {
    await expect(createUpgrader([nova([{ description: 'x', steps: [step('nisc.nova/widget', ({ document }) => document)] }]), prism()], { transform })).rejects.toMatchObject({ code: 'UNKNOWN_KIND' });
    await expect(createUpgrader([nova()], { transform })).rejects.toMatchObject({ code: 'UNKNOWN_KIND' }); // embeds nisc.prism/config
  });

  it('tables and documents are different owners, and each path refuses the other', async () => {
    const tables: Sequence = { id: 'acme.app', migrations: [{ description: 'People', steps: [{ kind: 'sql', sql: 'CREATE TABLE people (id text)' }] }] };
    await expect(createUpgrader([tables], { transform })).rejects.toMatchObject({ code: 'WRONG_OWNER' });
    const pool = { query: async () => ({ rows: [] }), transaction: async <T>(fn: (tx: { query: () => Promise<{ rows: never[] }> }) => Promise<T>) => fn({ query: async () => ({ rows: [] }) }) };
    await expect(migrate(pool, [nova(), prism()])).rejects.toMatchObject({ code: 'WRONG_OWNER' });
  });

  // strata reads a sequence as a grammar when it declares `documents` or has a
  // document step. A kit with nothing but markers declares neither, so it reads
  // as owning tables — and a refusal whose only advice is `migrate` would put
  // the kit's markers in a database's ledger. It has to say what makes a grammar.
  it('a markers-only sequence without `documents` is refused, and the refusal says to declare them', async () => {
    const kit: Sequence = { id: 'acme.kit', migrations: [{ description: 'Button may carry an icon', steps: [] }] };
    const error = await createUpgrader([nova(), prism(), kit], { transform }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'WRONG_OWNER', details: ['acme.kit'] });
    expect(String(error)).toContain('declare its `documents`');
  });

  it('the same sequence declaring `documents` is a grammar, markers and all', async () => {
    const kit: Sequence = { id: 'acme.kit', documents: {}, migrations: [{ description: 'Button may carry an icon', steps: [] }] };
    const upgrader = await createUpgrader([nova(), prism(), kit], { transform });
    expect(upgrader.stamp).toEqual({ 'nisc.nova': 0, 'nisc.prism': 0, 'acme.kit': 1 });
  });

  it('one sequence cannot own both', async () => {
    const mixed: Sequence = { id: 'acme.both', documents: { thing: {} }, migrations: [{ description: 'x', steps: [{ kind: 'sql', sql: 'SELECT 1' }] }] };
    await expect(prepare([mixed])).rejects.toMatchObject({ code: 'INVALID_SEQUENCE' });
  });
});
