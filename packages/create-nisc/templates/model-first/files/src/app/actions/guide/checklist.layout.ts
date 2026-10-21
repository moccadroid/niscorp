import type { LayoutNode } from '@niscorp/nova';

export const checklistLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}' },
  children: [
    { for: '$.todo', as: 'item', do: { component: 'Check', ref: 'tick', props: { label: '$item', checked: false, value: '$index' } } },
    { for: '$.done', as: 'item', do: { component: 'Check', ref: 'untick', props: { label: '$item', checked: true, value: '$index' } } },
    {
      component: 'Row',
      children: [
        { component: 'Input', ref: 'adding', model: '$.adding', props: { placeholder: 'Add a step' } },
        { if: '$.adding', then: { component: 'Button', ref: 'add', props: { label: 'Add' } } },
      ],
    },
  ],
};
