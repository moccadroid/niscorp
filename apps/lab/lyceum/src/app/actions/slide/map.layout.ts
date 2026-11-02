import type { LayoutNode } from '@niscorp/nova';

// The nisc map: four layers and their packages, with the one a talk is about
// lit. Every package talk opens with it and closes with it; `says` gives each
// layer a line, shown when the slide sets it.
export const NISC_LAYERS = [
  { name: 'Screens', packages: 'Nova', says: 'What you see, drawn from documents.' },
  { name: 'Data', packages: 'Prism · Vex · Strata', says: 'Queries, transforms and migrations, as documents.' },
  { name: 'Models', packages: 'Signal · Solid · Cortex', says: 'Typed answers, streams and agents.' },
  { name: 'Server', packages: 'Moss · Charter · Tide', says: 'Each person’s app on the server, permissions and schedules.' },
] as const;

export const layersLit = (lit: string): { name: string; packages: string; says: string; lit: boolean }[] => NISC_LAYERS.map((layer) => ({ ...layer, lit: layer.packages.split(' · ').includes(lit) }));

const AREAS = ['screens', 'data', 'models', 'server'];

const layer = (index: number): LayoutNode => ({
  component: 'Cell',
  props: { area: AREAS[index], align: 'middle', ink: { $if: `$.layers.${index}.lit`, $then: 'signal', $else: 'paper' } },
  children: [
    { component: 'Label', children: `{{$.layers.${index}.name}}` },
    { component: 'Headline', props: { level: 'title' }, children: `{{$.layers.${index}.packages}}` },
    { if: '$.detailed', then: { component: 'Text', children: `{{$.layers.${index}.says}}` } },
  ],
});

export const mapLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['head', ...AREAS], cols: [1], rows: ['auto', 1, 1, 1, 1] },
  children: [{ component: 'Cell', props: { area: 'head' }, children: [{ component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }] }, ...AREAS.map((_, index) => layer(index))],
};
