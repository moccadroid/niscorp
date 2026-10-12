import type { ActionDefinition } from '@niscorp/nova';

export const resetAction: ActionDefinition = {
  id: 'speaker.reset',
  title: 'Reset the talk',
  data: { sheetTitle: 'Reset the talk?', result: { done: false, people: 0 }, error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['what what', 'no yes', 'out out'] },
    children: [
      {
        component: 'Cell',
        props: { area: 'what' },
        children: [{ component: 'Text', children: 'Everybody is sent back to the join screen. Questions, queries, timers, everything given and installed: gone. The deck goes to slide 1.' }],
      },
      { component: 'Action', ref: 'no', props: { area: 'no', ink: 'paper', label: 'No' } },
      { component: 'Action', ref: 'yes', props: { area: 'yes', ink: 'alert', label: 'Yes, reset' } },
      { if: '$.error', then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] } },
    ],
  },
  endpoints: { reset: { fn: 'talk.reset', target: 'result', errorTarget: 'error' } },
  triggers: [
    { event: 'ui:click', ref: 'yes', do: [{ set: 'error', value: '' }, { call: 'reset', onSuccess: [{ pop: true }] }] },
    { event: 'ui:click', ref: 'no', do: [{ pop: true }] },
  ],
};
