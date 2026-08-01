import type { LayoutNode } from '@niscorp/nova';

// The desk's half of room status: what is sellable, what is being turned, and
// the one verb a clerk needs — releasing a room somebody is waiting for.
//
// Ops owns taking a room OUT of the estate for a fortnight. This owns the
// minute-to-minute question, which is a different decision made forty times a
// day by a different person. Two surfaces over one column, and the split is the
// role rather than the data.
export const deskRoomsLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16, maxWidth: 900 },
  children: [
    {
      component: 'Row',
      props: { gap: 8 },
      children: [
        { component: 'Button', ref: 'tab', props: { value: 'all', variant: { $if: { $eq: ['$.scope', 'all'] }, $then: 'solid', $else: 'quiet' } }, children: 'All' },
        { component: 'Button', ref: 'tab', props: { value: 'ready', variant: { $if: { $eq: ['$.scope', 'ready'] }, $then: 'solid', $else: 'quiet' } }, children: 'Ready to sell' },
        { component: 'Button', ref: 'tab', props: { value: 'turning', variant: { $if: { $eq: ['$.scope', 'turning'] }, $then: 'solid', $else: 'quiet' } }, children: 'To turn' },
      ],
    },
    {
      component: 'Rows',
      props: {
        rows: '$.rows',
        loading: '$.loading',
        rowKey: 'room_id',
        empty: 'Nothing here.',
        columns: [
          { label: 'Room', w: 1, cell: { kind: 'primary', key: 'number_display', subKey: 'where' } },
          { label: '', w: 'auto', cell: { kind: 'chip', key: 'state', toneKey: 'state_tone' } },
          // The only verb. A room that has been turned is CLEAN; a supervisor
          // signing it off makes it sellable, and that press is this button.
          { label: '', w: 'auto', cell: { kind: 'action', ref: 'release', label: 'Sign it off', variant: 'quiet' } },
        ],
      },
    },
    {
      component: 'Text',
      props: { size: 'sm', color: 'mute' },
      children: 'Signing a room off is what makes it sellable to somebody standing at the counter. Taking one out of service for longer is the manager’s.',
    },
  ],
};
