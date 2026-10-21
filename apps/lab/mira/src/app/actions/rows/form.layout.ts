import type { LayoutNode } from '@niscorp/nova';

export const formLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}' },
  children: [
    { for: '$.fields', as: 'field', key: 'key', do: { component: 'Field', props: { label: '$field.label' }, children: [{ component: 'Input', model: '$field.value' }] } },
    {
      component: 'Row',
      children: [
        { component: 'Button', ref: 'save', props: { label: { $if: '$.saving', $then: 'Saving…', $else: 'Save' } } },
        { if: '$.saved', then: { component: 'Text', props: { tone: 'muted' }, children: 'Saved.' } },
      ],
    },
    { if: '$.error', then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error}}' } },
  ],
};
