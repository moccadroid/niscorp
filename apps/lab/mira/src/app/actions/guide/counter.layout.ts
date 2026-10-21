import type { LayoutNode } from '@niscorp/nova';

export const counterLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}' },
  children: [
    { component: 'Text', props: { tone: 'display' }, children: '{{$.count}}' },
    {
      component: 'Row',
      children: [
        { component: 'Button', ref: 'down', props: { label: '−' } },
        { component: 'Button', ref: 'up', props: { label: '+' } },
        { component: 'Button', ref: 'reset', props: { label: 'Start over', tone: 'step' } },
      ],
    },
    { component: 'Code', props: { text: '{ "count": {{$.count}} }' } },
    { component: 'Text', props: { tone: 'muted' }, children: 'The number is this card’s data; each press changes it.' },
  ],
};
