import type { LayoutNode } from '@niscorp/nova';

export const statLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}' },
  children: [
    {
      if: '$.error',
      then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error.message}}' },
      else: { component: 'Stat', props: { value: '$.result.value', label: '$.label' } },
    },
  ],
};
