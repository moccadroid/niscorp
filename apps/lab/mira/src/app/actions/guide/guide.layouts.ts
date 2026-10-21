import type { LayoutNode } from '@niscorp/nova';

const lead: LayoutNode = { component: 'Text', props: { tone: 'lead' }, children: '{{$.lead}}' };

const links: LayoutNode = {
  if: '$.links',
  then: { component: 'Row', children: [{ for: '$.links', as: 'link', do: { component: 'Button', ref: 'link', props: { label: '$link.label', tone: 'link', value: '$link.screen' } } }] },
};

const toAsk: LayoutNode = {
  component: 'Row',
  children: [{ for: '$.examples', as: 'example', do: { component: 'Button', ref: 'example', props: { label: '$example', tone: 'suggestion', value: '$example' } } }],
};

export const welcomeLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}', tone: 'hero' },
  children: [lead, links, { component: 'Text', props: { tone: 'muted' }, children: 'Or ask for something in the line below:' }, toAsk],
};

export const askLayout: LayoutNode = { component: 'Card', props: { title: '{{$.title}}' }, children: [lead, toAsk] };

export const pointsLayout: LayoutNode = { component: 'Card', props: { title: '{{$.title}}' }, children: [lead, { component: 'Points', props: { items: '$.points' } }, links] };

export const exampleLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}' },
  children: [lead, { component: 'Code', props: { text: '$.example' } }, { component: 'Text', props: { tone: 'muted' }, children: '{{$.text}}' }, links],
};

export const stepsLayout: LayoutNode = { component: 'Card', props: { title: '{{$.title}}' }, children: [lead, { component: 'Steps', props: { items: '$.steps' } }, links] };
