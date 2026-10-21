import type { LayoutNode } from '@niscorp/nova';

export const tableLayout: LayoutNode = {
  component: 'Card',
  props: { title: '{{$.title}}' },
  children: [
    {
      if: '$.error',
      then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error.message}}' },
      else: { component: 'Table', props: { columns: '$.columns', rows: '$.rows' } },
    },
  ],
};
