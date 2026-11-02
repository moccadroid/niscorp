import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// The `renderers` table holds the same closed sets.
export const SURFACES = ['phones', 'stage', 'controller'] as const;
export const RENDERERS = ['dom', 'react', 'vue', 'svelte', 'angular', 'text'] as const;

export const surfaceRenderer: SeedEntry = {
  fingerprint: 'renderers/surface',
  refresh: 'reactive',
  intent: 'The renderer that draws one surface: dom, react, vue, svelte, angular or text',
  shape: { renderer: '' },
  dsl: {
    from: ['renderers'],
    fields: ['renderers.renderer'],
    filter: { eq: ['renderers.surface', { $context: 'surface' }] },
  },
  mapping: { renderer: { $get: { from: { $ref: '$.result' }, path: ['renderer'], fallback: { $const: 'dom' } } } },
};

const choice = (renderer: string, label: string): unknown => ({
  label: { $const: label },
  on: { $eq: [{ $get: { from: { $var: 'row' }, path: ['renderer'] } }, { $const: renderer }] },
  value: {
    surface: { $get: { from: { $var: 'row' }, path: ['surface'] } },
    renderer: { $const: renderer },
  },
});

export const allRenderers: SeedEntry = {
  fingerprint: 'renderers/all',
  refresh: 'reactive',
  intent: 'Every surface and the renderer that draws it, in order',
  shape: [{ surface: '', label: '', choices: [{ label: '', on: false, value: { surface: '', renderer: '' } }] }],
  dsl: {
    from: ['renderers'],
    fields: ['renderers.surface', 'renderers.renderer', 'renderers.position'],
    sort: [{ field: 'renderers.position', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'row',
      body: {
        surface: { $get: { from: { $var: 'row' }, path: ['surface'] } },
        label: {
          $case: {
            branches: [
              { when: { $eq: [{ $get: { from: { $var: 'row' }, path: ['surface'] } }, { $const: 'phones' }] }, then: { $const: 'Phones' } },
              { when: { $eq: [{ $get: { from: { $var: 'row' }, path: ['surface'] } }, { $const: 'stage' }] }, then: { $const: 'Stage' } },
            ],
            else: { $const: 'Controller' },
          },
        },
        choices: [choice('dom', 'DOM'), choice('react', 'React'), choice('vue', 'Vue'), choice('svelte', 'Svelte'), choice('angular', 'Angular'), choice('text', 'Text')],
      },
    },
  },
};

export const setRenderer: SeedMutation = {
  fingerprint: 'renderers/set',
  intent: 'Change the renderer that draws one surface',
  mutation: {
    op: 'update',
    table: 'renderers',
    set: { renderer: { $context: 'renderer' } },
    where: { eq: ['renderers.surface', { $context: 'surface' }] },
  },
};

// A member's own phone: the row rule keeps each member to their own row.
export const myRenderer: SeedEntry = {
  fingerprint: 'renderers/mine',
  refresh: 'reactive',
  intent: 'The renderer this member picked for their own phone, if they picked one',
  shape: [{ renderer: '' }],
  dsl: { from: ['member_renderers'], fields: ['member_renderers.renderer'], limit: 1 },
};

export const pickRenderer: SeedMutation = {
  fingerprint: 'renderers/mine/set',
  intent: 'Pick the renderer that draws this member’s own phone',
  mutation: {
    op: 'insert',
    table: 'member_renderers',
    values: { renderer: { $context: 'renderer' } },
    onConflict: { target: ['member_id'], set: { renderer: { $context: 'renderer' } } },
  },
};

const PICK_NAMES: Readonly<Record<(typeof RENDERERS)[number], string>> = { dom: 'Plain DOM', react: 'React', vue: 'Vue', svelte: 'Svelte', angular: 'Angular', text: 'Terminal' };

// The stage reads every member's pick, counted by renderer.
export const allPicks: SeedEntry = {
  fingerprint: 'renderers/picks',
  refresh: 'reactive',
  intent: 'How many members picked each renderer for their own phone',
  shape: [{ renderer: '', picks: 0 }],
  dsl: {
    from: ['member_renderers'],
    fields: ['member_renderers.renderer'],
    aggregate: { picks: { count: '*' } },
    groupBy: ['member_renderers.renderer'],
  },
  // A renderer nobody picked has no row: the sum of nothing is 0.
  mapping: {
    items: RENDERERS.map((renderer) => ({
      label: { $const: PICK_NAMES[renderer] },
      value: {
        $sum: {
          over: {
            $pluck: {
              over: { $filter: { over: { $ref: '$.result' }, as: 'row', when: { $eq: [{ $get: { from: { $var: 'row' }, path: ['renderer'] } }, renderer] } } },
              key: 'picks',
            },
          },
        },
      },
    })),
  },
};

export const RENDERER_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [surfaceRenderer, allRenderers, setRenderer, myRenderer, pickRenderer, allPicks];
