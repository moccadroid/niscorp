import { describe, it, expect } from 'vitest';
import { harvestDefinition, harvestDefinitions, missingFrom, translateRenderTree } from '../../src/i18n';
import type { ActionDefinition, LayoutNode, RenderNode } from '../../src';

const layout: LayoutNode = {
  component: 'Stack',
  children: [
    { component: 'Hero', props: { title: 'People', lead: 'Everyone the studio deals with.' } },
    { component: 'Button', props: { label: 'Add a person', variant: 'solid' }, ref: 'add' },
    // A spec prop: the repeated structure of a table, as data.
    {
      component: 'Rows',
      props: {
        rows: '$.rows',
        empty: 'Nobody here yet.',
        columns: [
          { label: 'Person', cell: { kind: 'avatar', key: 'person_name' } },
          { label: 'Standing', cell: { kind: 'badge', key: 'status_display' } },
        ],
      },
    },
    { if: '$.error', then: { component: 'Notice', props: { message: 'Something went wrong.' } }, else: '' },
    { for: '$.tabs', as: 'tab', do: { component: 'Tab', props: { label: '$.tab.label', tooltip: 'Switch view' } } },
    'A bare text child',
  ],
};

const definition: ActionDefinition = {
  id: 'people.list',
  title: 'People',
  // `views` is a tab strip authored as DATA and bound into the layout — words
  // on a screen that no walk over layouts can see.
  data: {
    rows: [],
    error: '',
    status: 'Loading…',
    view: 'running',
    views: [
      { value: 'running', label: 'Running' },
      { value: 'recipes', label: 'Recipes' },
    ],
  },
  layout,
  triggers: [{ event: 'ui:click', ref: 'add', do: [{ set: 'error', value: 'Could not open the form.' }] }],
};

describe('harvest', () => {
  const found = harvestDefinition(definition);
  const phrases = found.map((entry) => entry.phrase);

  it('takes literals from props at prose keys, at any depth', () => {
    expect(phrases).toContain('People');
    expect(phrases).toContain('Everyone the studio deals with.');
    expect(phrases).toContain('Add a person');
    expect(phrases).toContain('Nobody here yet.');
    // Nested inside a `columns` spec — the case a top-level-props-only
    // harvester silently misses most of a table on.
    expect(phrases).toContain('Standing');
  });

  it('reaches into conditional and loop branches', () => {
    expect(phrases).toContain('Something went wrong.');
    expect(phrases).toContain('Switch view');
  });

  it('takes text children, the title, data defaults and trigger writes', () => {
    expect(phrases).toContain('A bare text child');
    expect(phrases).toContain('Loading…');
    expect(phrases).toContain('Could not open the form.');
  });

  it('leaves bindings, design tokens and data keys out', () => {
    // A binding resolves to data at render — putting a path in a dictionary is
    // how a language file fills up with `$.member.person_name`.
    expect(phrases).not.toContain('$.tab.label');
    expect(phrases).not.toContain('$.rows');
    // `variant`/`kind`/`key` carry design and data vocabulary, not prose.
    expect(phrases).not.toContain('solid');
    expect(phrases).not.toContain('avatar');
    expect(phrases).not.toContain('person_name');
  });

  it('reaches labels nested in data, and takes the label rather than the value', () => {
    // The failure this rule exists for is not a missing translation — it is a
    // missing translation the count does not know about. A screen whose tabs
    // live in `data` renders English while the harvest reports a full book.
    expect(phrases).toContain('Running');
    expect(phrases).toContain('Recipes');
    // The value BESIDE each label is machine vocabulary, and nested strings are
    // taken by the matcher — so `recipes`, which exists only inside the array,
    // is left where it is.
    expect(phrases).not.toContain('recipes');
    // Whereas `running` IS taken: it is also a top-level data string, and those
    // come whole because only the layout knows where one lands. The two rules
    // are visible here in one fixture, which is the point of pinning them
    // together — a host filters the enum out of its report by name.
    expect(phrases).toContain('running');
    expect(found.find((entry) => entry.phrase === 'running')?.where).toEqual(['people.list.data.view']);
  });

  it('records every author site for a phrase used twice', () => {
    const people = harvestDefinition(definition).find((entry) => entry.phrase === 'People');
    expect(people?.where).toHaveLength(2); // the title and the Hero
  });

  it('merges across a catalog and reports what a language is missing', () => {
    const all = harvestDefinitions({ 'people.list': definition });
    const missing = missingFrom(all, { People: 'Personen' });
    expect(missing.map((entry) => entry.phrase)).not.toContain('People');
    expect(missing.map((entry) => entry.phrase)).toContain('Add a person');
  });
});

// ─── the pass ────────────────────────────────────────────────

const tree: RenderNode[] = [
  {
    type: 'component',
    name: 'Rows',
    props: {
      empty: 'Nobody here yet.',
      columns: [{ label: 'Standing' }],
      // Row DATA, arriving from a query. `person_name` is a member's name and
      // must survive untouched; `status_display` is a closed-set word the app
      // has declared translatable by suffix.
      rows: [
        { person_name: 'Pass', status_display: 'Active' },
        { person_name: 'Anna Berger', status_display: 'On trial' },
      ],
    },
    children: [{ type: 'text', value: 'A bare text child' }],
  },
];

const book = {
  'Nobody here yet.': 'Noch niemand hier.',
  Standing: 'Status',
  Active: 'Aktiv',
  'On trial': 'Im Probetraining',
  'A bare text child': 'Ein einfacher Textknoten',
  Pass: 'Zehnerblock',
};

describe('translateRenderTree', () => {
  const out = translateRenderTree(tree, { phrases: book, keys: { suffixes: ['_display'] } });
  const node = out[0];
  const props = node?.type === 'component' ? node.props : {};

  it('swaps prose props, nested spec props and text nodes', () => {
    expect(props['empty']).toBe('Noch niemand hier.');
    expect(props['columns']).toEqual([{ label: 'Status' }]);
    const children = node?.type === 'component' ? node.children : [];
    expect(children[0]).toMatchObject({ type: 'text', value: 'Ein einfacher Textknoten' });
  });

  it('translates declared display fields inside row data', () => {
    const rows = props['rows'];
    expect(rows).toMatchObject([{ status_display: 'Aktiv' }, { status_display: 'Im Probetraining' }]);
  });

  it('LEAVES USER DATA ALONE even when it collides with a dictionary key', () => {
    // The named risk of keying on source strings. A member called "Pass" sits
    // at `person_name`, which no rule marks as prose — so the entry that would
    // rename them is never consulted. This is the guard rail: proseness is
    // decided by the KEY, never by the value matching something in the book.
    const rows = props['rows'];
    expect(rows).toMatchObject([{ person_name: 'Pass' }, { person_name: 'Anna Berger' }]);
  });

  it('passes an unknown phrase through and reports it once', () => {
    const misses: string[] = [];
    const result = translateRenderTree(
      [{ type: 'component', name: 'Hero', props: { title: 'Reports' }, children: [] }],
      { phrases: book, onMiss: (phrase) => misses.push(phrase) },
    );
    const hero = result[0];
    expect(hero?.type === 'component' ? hero.props['title'] : undefined).toBe('Reports');
    expect(misses).toEqual(['Reports']);
  });

  it('returns the very same tree when the book is empty', () => {
    // The source language must not pay for the pass: an identical reference
    // means the frame serializes to the same bytes it always did.
    expect(translateRenderTree(tree, { phrases: {} })).toBe(tree);
  });

  it('returns the same nodes when nothing under them matched', () => {
    const untouched: RenderNode[] = [{ type: 'component', name: 'Box', props: { gap: 4 }, children: [] }];
    expect(translateRenderTree(untouched, { phrases: book })).toBe(untouched);
  });
});
