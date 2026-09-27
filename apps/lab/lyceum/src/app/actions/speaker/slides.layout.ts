import type { LayoutNode } from '@niscorp/nova';

// The deck as a numbered list, the slide on screen marked; a row is a press.
export const slidesLayout: LayoutNode = {
  component: 'Rows',
  props: {
    rows: '$.slides',
    rowKey: 'position',
    rowRef: 'pick',
    selected: '$.current.position',
    columns: [
      { label: '#', key: 'number', kind: 'mono', w: 0.4 },
      { label: 'Slide', key: 'title', w: 5 },
    ],
  },
};
