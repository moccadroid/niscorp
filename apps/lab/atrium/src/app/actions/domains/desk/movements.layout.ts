import type { LayoutNode } from '@niscorp/nova';

// Who is coming and who is going, with the state of their room beside them.
//
// It replaces two surfaces that read the same query. `desk.arrivals` listed
// movements; `desk.keys` listed movements again with a search box, because
// cutting a key needed a guest and the only way to find one was to type their
// name. Two lists of the same rows, one of which existed to work around not
// being able to aim a verb at a row.
//
// The room state is the column that makes it worth opening. "Arriving at half
// four" and "that room is still dirty" were two facts in two places, and
// together they are the only real decision on a front desk at four o'clock.
export const movementsLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16, maxWidth: 980 },
  children: [
    {
      component: 'Row',
      props: { gap: 8, align: 'center', justify: 'between' },
      children: [
        {
          component: 'Row',
          props: { gap: 8 },
          children: [
            { component: 'Button', ref: 'tab', props: { value: 'all', variant: { $if: { $eq: ['$.scope', 'all'] }, $then: 'solid', $else: 'quiet' } }, children: 'All' },
            { component: 'Button', ref: 'tab', props: { value: 'due', variant: { $if: { $eq: ['$.scope', 'due'] }, $then: 'solid', $else: 'quiet' } }, children: 'Due in' },
            { component: 'Button', ref: 'tab', props: { value: 'staying', variant: { $if: { $eq: ['$.scope', 'staying'] }, $then: 'solid', $else: 'quiet' } }, children: 'In house' },
          ],
        },
        { component: 'Box', props: { grow: true }, children: { component: 'Input', ref: 'search', model: '$.search', props: { placeholder: 'Find a guest…' } } },
      ],
    },
    {
      component: 'Rows',
      props: {
        rows: '$.rows',
        loading: '$.loading',
        rowKey: 'stay_id',
        rowRef: 'row',
        empty: 'Nobody in or out.',
        columns: [
          { label: 'Guest', w: 1, cell: { kind: 'primary', key: 'guest_name', subKey: 'eta' } },
          { label: 'Room', w: 'auto', cell: { kind: 'primary', key: 'room_number', subKey: 'room_state' } },
          { label: '', w: 'auto', cell: { kind: 'chip', key: 'state_text', toneKey: 'state_tone' } },
          { label: 'Stay', w: 1, cell: { kind: 'primary', key: 'arrival_display', subKey: 'departure_display' } },
          { label: '', w: 'auto', cell: { kind: 'action', ref: 'open', label: 'Open' } },
        ],
      },
    },
    {
      component: 'Text',
      props: { size: 'sm', color: 'mute' },
      children: 'A room reading “To turn” cannot be given to anybody yet — the room board is where that changes.',
    },
  ],
};
