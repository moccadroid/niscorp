import type { LayoutNode } from '@niscorp/nova';

export const barsLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}' },
  children: [
    {
      if: '$.error',
      then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error.message}}' },
      else: { component: 'Bars', props: { items: '$.items' } },
    },
  ],
};
