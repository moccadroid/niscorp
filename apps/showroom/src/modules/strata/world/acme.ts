import type { Sequence, Stamp, Upgrader } from '@niscorp/strata';
import { createUpgrader } from '@niscorp/strata';
import { NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { evaluate } from '@niscorp/prism';
import { PRISM_SEQUENCE } from '@niscorp/prism/migrations';

// ═══════════════════════════════════════════════════════════
// Acme Studio — the one app every strata page follows.
//
// Four releases over a year. Each of the last three changes the app's component
// kit in a way that breaks every screen saved before it: a prop renamed, a
// prop's values changed, a component renamed. Each change ships ONE migration —
// a Prism config over one layout node — appended to the kit's grammar.
//
// Everything below is real: nova's and Prism's grammars as they ship, strata's
// upgrader, Prism's evaluator. Only the app is made up.
// ═══════════════════════════════════════════════════════════

const node = { $ref: '$.document' };
const componentIs = (name: string) => ({ $eq: [{ $get: { from: node, path: ['component'], fallback: null } }, { $const: name }] });
const hasProp = (key: string) => ({ $has: { from: node, path: ['props', key] } });
const onlyWhen = (when: unknown, then: unknown) => ({ $case: { branches: [{ when, then }], else: node } });

export const LABEL_TO_TEXT = onlyWhen(
  { $and: [componentIs('Button'), hasProp('label')] },
  { $update: { from: node, path: ['props'], value: { $renameKeys: { from: { $var: 'current' }, map: { label: 'text' } } } } },
);

export const TONE_TO_VARIANT = onlyWhen(
  { $and: [componentIs('Button'), hasProp('tone')] },
  {
    $update: {
      from: node,
      path: ['props'],
      value: {
        $renameKeys: {
          from: {
            $update: {
              from: { $var: 'current' },
              path: ['tone'],
              as: 'tone',
              value: { $case: { branches: [{ when: { $eq: [{ $var: 'tone' }, { $const: 'primary' }] }, then: { $const: 'filled' } }], else: { $const: 'plain' } } },
            },
          },
          map: { tone: 'variant' },
        },
      },
    },
  },
);

export const CARD_TO_TILE = onlyWhen(componentIs('Card'), { $update: { from: node, path: ['component'], value: { $const: 'Tile' } } });

export type Release = {
  n: number;
  name: string;
  when: string;
  change: string;
  // What a screen saved BEFORE this release looks like when this release's kit
  // draws it raw — and what a screen saved AT it looks like to the kit before.
  breaksOlder?: string;
  breaksNewer?: string;
  migration?: { description: string; transform: unknown };
};

export const RELEASES: readonly Release[] = [
  { n: 0, name: 'v1', when: 'March', change: 'First release' },
  {
    n: 1,
    name: 'v2',
    when: 'May',
    change: 'Button: label → text',
    breaksOlder: 'Every button is blank — this kit reads `text`, the document says `label`.',
    breaksNewer: 'Every button is blank — this kit reads `label`, the document says `text`.',
    migration: { description: 'Button: label → text', transform: LABEL_TO_TEXT },
  },
  {
    n: 2,
    name: 'v3',
    when: 'July',
    change: 'Button: tone → variant',
    breaksOlder: '"New class" lost its emphasis — `tone` means nothing to this kit.',
    breaksNewer: '"New class" lost its emphasis — `variant` means nothing to this kit.',
    migration: { description: 'Button: tone → variant', transform: TONE_TO_VARIANT },
  },
  {
    n: 3,
    name: 'v4',
    when: 'October',
    change: 'Card → Tile',
    breaksOlder: 'The class list is gone — this kit has no `Card`.',
    breaksNewer: 'The class list is gone — this kit has no `Tile` yet.',
    migration: { description: 'Card → Tile', transform: CARD_TO_TILE },
  },
];

export const LATEST = RELEASES.length - 1;

// The kit's grammar as release `n` ships it: the first `n` migrations. It owns a
// document kind (its props) the way a real app kit does — lyceum.kit is the model.
export const kitAt = (n: number): Sequence => ({
  id: 'acme.kit',
  documents: { props: { embeds: {} } },
  migrations: RELEASES.slice(1, n + 1).map((r) => ({
    description: r.migration?.description ?? r.change,
    steps: [{ kind: 'document' as const, at: 'nisc.nova/layout', transform: r.migration?.transform }],
  })),
});

export const grammarsAt = (n: number): readonly Sequence[] => [NOVA_SEQUENCE, PRISM_SEQUENCE, kitAt(n)];

// What a document written by release `n` carries.
export const stampAt = (n: number): Stamp => ({
  'nisc.nova': NOVA_SEQUENCE.migrations.length,
  'nisc.prism': PRISM_SEQUENCE.migrations.length,
  'acme.kit': n,
});

const upgraders = new Map<number, Promise<Upgrader>>();
export const upgraderAt = (n: number): Promise<Upgrader> => {
  const known = upgraders.get(n);
  if (known !== undefined) return known;
  const made = createUpgrader(grammarsAt(n), { transform: evaluate });
  upgraders.set(n, made);
  return made;
};

export const KIND = 'nisc.nova/action';

// The Classes screen as release v1 wrote it. Every later shape of it is derived
// below by the real upgrader — so the document "saved by v3" is exactly what v3
// would have written, not a hand-copied guess.
export const CLASSES_V1 = {
  id: 'acme.classes',
  title: 'Classes',
  data: {
    q: '',
    admin: true,
    rows: [
      { name: 'Morning flow', time: '07:30', spots: 4 },
      { name: 'Power hour', time: '12:15', spots: 0 },
      { name: 'Evening stretch', time: '19:00', spots: 9 },
    ],
  },
  layout: {
    component: 'Stack',
    children: [
      { component: 'Text', props: { size: 'title' }, children: 'Classes' },
      { component: 'Input', model: '$.q', props: { placeholder: 'Search classes' } },
      {
        for: '$.rows',
        as: 'row',
        do: {
          component: 'Card',
          children: [
            {
              component: 'Stack',
              props: { gap: 'tight' },
              children: [
                { component: 'Text', children: '{{$row.name}}' },
                { component: 'Text', props: { tone: 'muted' }, children: '{{$row.time}} · {{$row.spots}} spots left' },
              ],
            },
            { component: 'Button', ref: 'book', props: { label: 'Book' } },
          ],
        },
      },
      { if: '$.admin', then: { component: 'Button', ref: 'add', props: { label: 'New class', tone: 'primary' } } },
    ],
  },
  endpoints: {
    load: { url: '/api/acme/vex', method: 'POST', request: { fingerprint: 'classes/open', context: { q: { $ref: '$.q' } } }, target: 'rows' },
  },
};

export type Doc = Record<string, unknown>;

// The Classes screen exactly as release `n` would have saved it.
export const classesAt = async (n: number): Promise<Doc> =>
  (await upgraderAt(n)).upgrade(CLASSES_V1, { kind: KIND, stamp: stampAt(0) }).document;
