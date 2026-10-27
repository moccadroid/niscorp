import type { LayoutNode } from '@niscorp/nova';

export const suggestionsLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}' },
  children: [
    {
      component: 'Row',
      children: [{ for: '$.suggestions', as: 'suggestion', do: { component: 'Button', ref: 'suggestion', props: { label: '$suggestion', value: '$suggestion', tone: 'suggestion' } } }],
    },
  ],
};
