import type { LayoutNode } from '@niscorp/nova';

// The door, on a phone: choose a name. Twelve nobody has, as buttons — one
// press and you are in — more if none of them is you, or a name of your own.
// A name of your own is checked first; one that cannot be shown is not used,
// and the door says so and offers one instead.
export const doorLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head', 'names', 'more', 'own', 'use', 'out'], rows: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'Lyceum' }] },
    { component: 'Cell', props: { area: 'head' }, children: [{ component: 'Headline', props: { level: 'title' }, children: 'Choose your name' }] },
    {
      component: 'Cell',
      props: { area: 'names', pad: 'none' },
      children: [
        {
          component: 'Sheet',
          props: { areas: '$.offer.areas', cols: [1, 1] },
          children: [{ for: '$.offer.names', as: 'offered', do: { component: 'Action', ref: 'pick', props: { area: '$offered.area', ink: 'paper', label: '{{$offered.name}}', value: '$offered.name' } } }],
        },
      ],
    },
    { component: 'Action', ref: 'more', props: { area: 'more', ink: 'paper', label: 'Other names' } },
    { component: 'Field', ref: 'draft', model: '$.draft', props: { area: 'own', value: '$.draft', placeholder: 'Or type your own' } },
    { component: 'Action', ref: 'own', props: { area: 'use', ink: 'ink', label: { $if: '$.entering', $then: 'Stepping in…', $else: 'Use this name →' } } },
    {
      if: '$.refused.name',
      then: {
        component: 'Cell',
        props: { area: 'out', ink: 'alert' },
        children: [
          { component: 'Text', children: '“{{$.refused.name}}” can’t be shown here. You can be {{$.refused.suggested}} instead:' },
          { component: 'Action', ref: 'pick', props: { ink: 'ink', label: 'Continue as {{$.refused.suggested}} →', value: '$.refused.suggested' } },
        ],
      },
      else: {
        if: '$.error',
        then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
        else: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', props: { tone: 'muted' }, children: 'The name is how the room sees you tonight: on the projector, and with your questions.' }] },
      },
    },
  ],
};
