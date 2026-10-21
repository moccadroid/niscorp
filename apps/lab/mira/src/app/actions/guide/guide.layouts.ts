import type { LayoutNode } from '@niscorp/nova';

const lead: LayoutNode = { component: 'Text', props: { tone: 'lead' }, children: '{{$.lead}}' };

const next: LayoutNode = {
  component: 'Row',
  children: [{ for: '$.next', as: 'question', do: { component: 'Button', ref: 'next', props: { label: '$question', tone: 'suggestion', value: '$question' } } }],
};

export const pointsLayout: LayoutNode = { component: 'Card', props: { title: '{{$.title}}' }, children: [lead, { component: 'Points', props: { items: '$.points' } }, next] };

export const exampleLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}' },
  children: [lead, { component: 'Code', props: { text: '$.example' } }, { component: 'Text', props: { tone: 'muted' }, children: '{{$.text}}' }, next],
};

export const stepsLayout: LayoutNode = { component: 'Card', props: { title: '{{$.title}}' }, children: [lead, { component: 'Steps', props: { items: '$.steps' } }, next] };
