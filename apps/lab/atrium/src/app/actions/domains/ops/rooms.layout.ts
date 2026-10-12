import type { LayoutNode } from '@niscorp/nova';

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
            // The switch cell shows the inverse of its key: out of order off is
            // in service on.
            { label: 'In service', w: 'auto', cell: { kind: 'switch', key: 'out_of_order', ref: 'toggle', label: '' } },
          ],
        },
      },
    ],
  },
};
