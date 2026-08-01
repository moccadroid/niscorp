import type { LayoutNode } from '@niscorp/nova';

// The sellable-rooms list. This was hand-built from a Stack of Boxes carrying
// their own paddings and a Switch per row — the one list in the app that did not
// line up with the others, and exactly the "a component per entity" shape `Rows`
// exists to prevent. A row you flip is a `switch` cell; nothing else here is
// special.
export const roomsLayout: LayoutNode = {
  component: 'Box',
  props: {},
  children: {
    component: 'Stack',
    props: { gap: 20, maxWidth: 900 },
    children: [
      {
        component: 'Rows',
        props: {
          rows: '$.rows',
          loading: '$.loading',
          rowKey: 'room_id',
          empty: 'No rooms here.',
          columns: [
            { label: 'Room', w: 1, cell: { kind: 'primary', key: 'number_display', subKey: 'where' } },
            { label: '', w: 'auto', cell: { kind: 'chip', key: 'state', toneKey: 'state_tone' } },
            // The cell reads the flag and shows its INVERSE: out of order off
            // means in service on. Its payload is the row plus `next`, which is
            // the same contract the standalone Switch had.
            { label: 'In service', w: 'auto', cell: { kind: 'switch', key: 'out_of_order', ref: 'toggle', label: '' } },
          ],
        },
      },
    ],
  },
};
