import type { LayoutNode } from '@niscorp/nova';

// The talks as a list, the one that is on marked; a row is a press. When the
// server refused a switch because the room has something to lose, its words
// and the question instead: No leaves everything, Yes resets and switches.
export const talksLayout: LayoutNode = {
  if: '$.asked.message',
  then: {
    component: 'Sheet',
    props: { areas: ['what what', 'no yes'] },
    children: [
      { component: 'Cell', props: { area: 'what' }, children: [{ component: 'Text', children: '{{$.asked.message}}' }] },
      { component: 'Action', ref: 'no', props: { area: 'no', ink: 'paper', label: 'No' } },
      { component: 'Action', ref: 'yes', props: { area: 'yes', ink: 'alert', label: 'Yes, reset and switch' } },
    ],
  },
  else: {
    component: 'Rows',
    props: {
      rows: '$.talks',
      rowKey: 'talk_id',
      rowRef: 'pick',
      selected: '$.talk.talk_id',
      columns: [{ label: 'Talk', key: 'title', w: 5 }],
    },
  },
};
