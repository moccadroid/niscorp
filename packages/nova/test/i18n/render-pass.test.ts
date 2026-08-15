import { describe, it, expect } from 'vitest';
import { createComponentRegistry, createLayoutStore, render } from '../../src/layout';
import { createShell } from '../../src';
import type { LayoutNode, RenderNode, RenderOptions } from '../../src/layout';
import type { PhraseKeys, Phrasebook } from '../../src/i18n';

// ═══════════════════════════════════════════════════════════
// The language pass where it actually lives now: inside the renderer, at the
// moment a RenderNode is minted. Every adapter is downstream of this, so these
// are the tests that say "react, tty and moss all get the same words".
// ═══════════════════════════════════════════════════════════

const registry = createComponentRegistry();
for (const name of ['Stack', 'Hero', 'Button', 'Rows', 'Tab', 'Field', 'Stat']) {
  registry.register(name, { component: name });
}

const book: Phrasebook = {
  People: 'Menschen',
  'Add a person': 'Person hinzufügen',
  'Nobody here yet.': 'Noch niemand hier.',
  Person: 'Name',
  Standing: 'Status',
  Active: 'Aktiv',
  'A bare text child': 'Ein einfaches Textkind',
  '{n} of {total}': '{n} von {total}',
  'somebody enquires': 'jemand fragt an',
};

const renderWith = (layout: LayoutNode, data: Record<string, unknown>, extra: Partial<RenderOptions> = {}): RenderNode[] =>
  render({ layout, data, store: createLayoutStore(), registry, ...extra });

// Every string in the tree, in render order — the cheapest way to assert what a
// reader would see without reproducing node shapes in every expectation.
const words = (nodes: RenderNode[]): string[] => {
  const out: string[] = [];
  const walkValue = (value: unknown): void => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(walkValue);
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walkValue);
  };
  const walk = (node: RenderNode): void => {
    if (node.type === 'text') out.push(node.value);
    else if (node.type === 'fragment') node.children.forEach(walk);
    else if (node.type === 'component') {
      Object.values(node.props).forEach(walkValue);
      node.children.forEach(walk);
    }
  };
  nodes.forEach(walk);
  return out;
};

describe('the renderer translates', () => {
  it('swaps prose props and literal text children', () => {
    const layout: LayoutNode = {
      component: 'Stack',
      children: [
        { component: 'Hero', props: { title: 'People', variant: 'solid' } },
        { component: 'Button', props: { label: 'Add a person' } },
        'A bare text child',
      ],
    };
    const said = words(renderWith(layout, {}, { phrases: book }));
    expect(said).toContain('Menschen');
    expect(said).toContain('Person hinzufügen');
    expect(said).toContain('Ein einfaches Textkind');
    // A design token sitting at a non-prose key is untouched.
    expect(said).toContain('solid');
  });

  it('reaches prose at any depth inside a spec prop', () => {
    const layout: LayoutNode = {
      component: 'Rows',
      props: {
        empty: 'Nobody here yet.',
        columns: [
          { label: 'Person', cell: { kind: 'avatar', key: 'person_name' } },
          { label: 'Standing', cell: { kind: 'badge', key: 'status_display' } },
        ],
      },
    };
    const said = words(renderWith(layout, {}, { phrases: book }));
    expect(said).toContain('Noch niemand hier.');
    expect(said).toContain('Name');
    expect(said).toContain('Status');
    // `kind` and `key` carry machine vocabulary and stay put.
    expect(said).toContain('avatar');
    expect(said).toContain('person_name');
  });

  it('translates a BOUND prose prop — the closed-set word a query made', () => {
    const keys: PhraseKeys = { suffixes: ['_display'] };
    const layout: LayoutNode = { component: 'Field', props: { status_display: '$.row.status_display' } };
    const said = words(renderWith(layout, { row: { status_display: 'Active' } }, { phrases: book, phraseKeys: keys }));
    expect(said).toContain('Aktiv');
  });

  it('LEAVES A BOUND TEXT CHILD ALONE even when it collides with the book', () => {
    // The rule the tree pass could not write: by the time a tree exists, a
    // person called "Person" and the column header "Person" are the same
    // string. The renderer still knows one was authored and one arrived.
    const layout: LayoutNode = { component: 'Stack', children: ['$.member.name', 'Person'] };
    const said = words(renderWith(layout, { member: { name: 'Person' } }, { phrases: book }));
    expect(said).toEqual(['Person', 'Name']);
  });

  it('leaves user data alone at a non-prose key', () => {
    const layout: LayoutNode = { component: 'Field', props: { name: '$.member.name', label: 'Standing' } };
    const said = words(renderWith(layout, { member: { name: 'Active' } }, { phrases: book }));
    expect(said).toContain('Active');
    expect(said).toContain('Status');
    expect(said).not.toContain('Aktiv');
  });

  it('passes an unknown phrase through and reports it once', () => {
    const misses: string[] = [];
    const layout: LayoutNode = {
      component: 'Stack',
      children: [
        { component: 'Button', props: { label: 'Archive everything' } },
        { component: 'Button', props: { label: 'Archive everything' } },
      ],
    };
    const said = words(renderWith(layout, {}, { phrases: book, onPhraseMiss: (phrase) => misses.push(phrase) }));
    expect(said).toEqual(['Archive everything', 'Archive everything']);
    expect(misses).toEqual(['Archive everything', 'Archive everything']);
  });

  it('names where a miss was found', () => {
    const found: string[] = [];
    const layout: LayoutNode = {
      component: 'Stack',
      children: [{ component: 'Button', props: { label: 'Archive everything' } }],
    };
    renderWith(layout, {}, { phrases: book, onPhraseMiss: (_phrase, where) => found.push(where) });
    expect(found).toEqual(['/Stack/Button.label']);
  });
});

describe('counted phrases', () => {
  const layout: LayoutNode = { component: 'Stat', props: { phrase: '$.count' } };
  const keys: PhraseKeys = { props: ['phrase'] };
  const counted = { count: { phrase: '{n} of {total}', slots: { n: 1, total: 12 } } };

  it('translates the pattern whole and fills it', () => {
    const said = words(renderWith(layout, counted, { phrases: book, phraseKeys: keys }));
    expect(said).toEqual(['1 von 12']);
  });

  it('FILLS IN THE SOURCE LANGUAGE TOO — keys, no book', () => {
    // The job that used to belong to a helper in the host's component kit. A
    // session with nothing to translate still must not put a `{ phrase, slots }`
    // object on the glass.
    const said = words(renderWith(layout, counted, { phraseKeys: keys }));
    expect(said).toEqual(['1 of 12']);
  });

  it('offers a string slot to the book as vocabulary in its own right', () => {
    const composed = { count: { phrase: '{n} of {total}', slots: { n: 'somebody enquires', total: 12 } } };
    const said = words(renderWith(layout, composed, { phrases: book, phraseKeys: keys }));
    expect(said).toEqual(['jemand fragt an von 12']);
  });

  it('is left as the object it is when the host does no i18n at all', () => {
    const nodes = renderWith(layout, counted);
    expect(nodes[0]).toMatchObject({ props: { phrase: counted.count } });
  });
});

describe('a shell renders in its language', () => {
  const actions = {
    'people.list': {
      id: 'people.list',
      data: { status: 'Active' },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Hero', props: { title: 'People' } },
          { component: 'Field', props: { label: '$.status' } },
        ],
      },
    },
  };

  const shellWith = (phrases: Phrasebook | undefined) => {
    const shell = createShell({
      canvases: [{ id: 'main', initial: 'people.list' }],
      actions,
      registry,
      ...(phrases === undefined ? {} : { phrases }),
      phraseKeys: { props: ['title', 'label'] },
    });
    return shell;
  };

  it('translates an instance tree, not just the chrome', () => {
    const shell = shellWith(book);
    const instance = shell.getCanvasState('main').active;
    expect(instance).toBeDefined();
    const tree = shell.getRuntime(instance?.id ?? '')?.render() ?? [];
    expect(words(tree)).toEqual(['Menschen', 'Aktiv']);
  });

  it('renders the source language when it holds no book', () => {
    const shell = shellWith(undefined);
    const instance = shell.getCanvasState('main').active;
    const tree = shell.getRuntime(instance?.id ?? '')?.render() ?? [];
    expect(words(tree)).toEqual(['People', 'Active']);
  });

  it('setPhrases reaches an instance that is ALREADY MOUNTED', () => {
    const shell = shellWith(undefined);
    const instance = shell.getCanvasState('main').active;
    const runtime = shell.getRuntime(instance?.id ?? '');
    expect(words(runtime?.render() ?? [])).toEqual(['People', 'Active']);
    shell.setPhrases(book);
    expect(words(runtime?.render() ?? [])).toEqual(['Menschen', 'Aktiv']);
    shell.setPhrases(undefined);
    expect(words(runtime?.render() ?? [])).toEqual(['People', 'Active']);
  });

  it('fires a state change so mounted adapters re-render', () => {
    const shell = shellWith(undefined);
    let fired = 0;
    shell.onStateChange(() => { fired += 1; });
    shell.setPhrases(book);
    expect(fired).toBe(1);
  });

  it('KEEPS FILLING PATTERNS after its book is withdrawn', () => {
    // Withdrawing a book is the source language, not switching i18n off. A
    // shell that stopped filling patterns here would hand its adapter a
    // `{ phrase, slots }` object where a word belongs — which is a crash in
    // React, not a missing translation.
    const counted = {
      id: 'counted',
      data: { fill: { phrase: '{n} of {total}', slots: { n: 1, total: 12 } } },
      layout: { component: 'Field', props: { label: '$.fill' } },
    };
    const shell = createShell({
      canvases: [{ id: 'main', initial: 'counted' }],
      actions: { counted },
      registry,
      phrases: book,
      phraseKeys: { props: ['label'] },
    });
    const runtime = shell.getRuntime(shell.getCanvasState('main').active?.id ?? '');
    expect(words(runtime?.render() ?? [])).toEqual(['1 von 12']);
    shell.setPhrases(undefined);
    expect(words(runtime?.render() ?? [])).toEqual(['1 of 12']);
  });

  it('a shell given a book LATER starts filling patterns too', () => {
    const counted = {
      id: 'counted',
      data: { fill: { phrase: '{n} of {total}', slots: { n: 2, total: 9 } } },
      layout: { component: 'Field', props: { label: '$.fill' } },
    };
    // No language at all at build: the pattern is left as the object it is,
    // because this shell is not doing i18n and pays nothing for it.
    const shell = createShell({ canvases: [{ id: 'main', initial: 'counted' }], actions: { counted }, registry });
    const runtime = shell.getRuntime(shell.getCanvasState('main').active?.id ?? '');
    expect(words(runtime?.render() ?? [])).toEqual(['{n} of {total}']);
    shell.setPhrases(book);
    expect(words(runtime?.render() ?? [])).toEqual(['2 von 9']);
  });
});
