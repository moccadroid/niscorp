import type { LayoutNode } from '@niscorp/nova';

export const textLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}' },
  children: [
    { component: 'Text', children: '{{$.text}}' },
    {
      component: 'Row',
      children: [{ for: '$.examples', as: 'example', do: { component: 'Button', ref: 'example', props: { label: '$example', tone: 'quiet', value: '$example' } } }],
    },
  ],
};
