import type { LayoutNode } from '@niscorp/nova';

export const overviewLayout: LayoutNode = {
  if: '$.loading',
  then: { component: 'Skeleton', props: { h: 22, count: 5 } },
  else: {
    component: 'Stack',
    props: { gap: 22 },
    children: [
      {
        component: 'Grid',
        props: { columns: 2, gap: 18 },
        children: [
          { component: 'Stat', props: { label: 'Room', value: '$.stay.room_number', hint: '$.stay.room_kind' } },
          { component: 'Stat', props: { label: 'Rate', value: '$.stay.rate_display', hint: 'per night' } },
        ],
      },
      { component: 'Rule', props: {} },
      {
        component: 'Stack',
        props: { gap: 9 },
        children: [
          { component: 'Row', props: { justify: 'between' }, children: [{ component: 'Text', props: { color: 'mute' }, children: 'Arriving' }, { component: 'Text', props: { weight: 600 }, children: '$.stay.arrival_display' }] },
          { component: 'Row', props: { justify: 'between' }, children: [{ component: 'Text', props: { color: 'mute' }, children: 'Leaving' }, { component: 'Text', props: { weight: 600 }, children: '$.stay.departure_display' }] },
          { component: 'Row', props: { justify: 'between' }, children: [{ component: 'Text', props: { color: 'mute' }, children: 'Guest' }, { component: 'Text', props: { weight: 600 }, children: '$.stay.guest_name' }] },
          {
            component: 'Row',
            props: { justify: 'between' },
            children: [
              { component: 'Text', props: { color: 'mute' }, children: 'Status' },
              { component: 'Badge', props: { tone: 'accent', dot: true }, children: '$.stay.state_text' },
            ],
          },
        ],
      },
      {
        if: '$.issues.length',
        then: {
          component: 'Section',
          props: { title: 'What you have told us' },
          children: {
            component: 'Rows',
            props: {
              rows: '$.issues',
              rowKey: 'issue_id',
              dense: true,
              columns: [
                { w: 3, cell: { kind: 'primary', key: 'summary', subKey: 'raised_display' } },
                { w: 'auto', cell: { kind: 'chip', key: 'status', toneKey: 'status_tone' } },
              ],
            },
          },
        },
        else: '',
      },
    ],
  },
};
