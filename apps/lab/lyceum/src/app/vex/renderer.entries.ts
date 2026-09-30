import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// ── which renderer draws each surface: the phones, the projector, the controller ──

// The surfaces and the renderers, in one place: the entries, the marker
// actions, the controller's switch. The table holds the same closed sets.
export const SURFACES = ['phones', 'stage', 'controller'] as const;
export const RENDERERS = ['dom', 'react', 'vue'] as const;

// One surface's renderer — what its marker names (app/actions/look/). Reactive:
// the speaker writes the row, and every screen of that surface is drawn again
// by the other renderer; nothing announces it. A single-row shape: `result` is
// the row itself, or null.
export const surfaceRenderer: SeedEntry = {
  fingerprint: 'renderers/surface',
  refresh: 'reactive',
  intent: 'The renderer that draws one surface: dom, react or vue',
  shape: { renderer: '' },
  dsl: {
    from: ['renderers'],
    fields: ['renderers.renderer'],
    filter: { eq: ['renderers.surface', { $context: 'surface' }] },
  },
  mapping: { renderer: { $get: { from: { $ref: '$.result' }, path: ['renderer'], fallback: { $const: 'dom' } } } },
};

// Every surface and its renderer, for the controller's switch: one row per
// surface, in order, with a choice per renderer and whether it is the one in
// use — so the layout marks it without comparing anything itself.
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
              { when: { $eq: [{ $get: { from: { $var: 'row' }, path: ['surface'] } }, { $const: 'stage' }] }, then: { $const: 'Projector' } },
            ],
            else: { $const: 'Controller' },
          },
        },
        choices: [choice('dom', 'DOM'), choice('react', 'React'), choice('vue', 'Vue')],
      },
    },
  },
};

// Change one surface's renderer. Any other surface or renderer is refused by
// the table.
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

export const RENDERER_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [surfaceRenderer, allRenderers, setRenderer];
