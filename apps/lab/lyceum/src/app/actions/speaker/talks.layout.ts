import type { LayoutNode } from '@niscorp/nova';

// The talks as a list, the one that is on marked; a row is a press.
export const talksLayout: LayoutNode = {
  component: 'Rows',
  props: {
    rows: '$.talks',
    rowKey: 'talk_id',
    rowRef: 'pick',
    selected: '$.talk.talk_id',
    columns: [{ label: 'Talk', key: 'title', w: 5 }],
  },
};
