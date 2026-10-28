import type { LayoutNode } from '@niscorp/nova';

export const meLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'You' },
  children: [
    {
      if: '$.me.name',
      then: { component: 'Text', props: { tone: 'lead' }, children: 'Mira calls you {{$.me.name}}.' },
      else: { component: 'Text', props: { tone: 'lead' }, children: 'Mira does not know your name yet.' },
    },
    {
      component: 'Row',
      children: [
        { component: 'Input', ref: 'name', model: '$.name', props: { placeholder: 'Your name' } },
        { component: 'Button', ref: 'save', props: { label: { $if: '$.saving', $then: 'Saving…', $else: 'Save' }, disabled: { $if: '$.name', $then: false, $else: true } } },
      ],
    },
    { if: '$.error', then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error}}' } },
  ],
};
