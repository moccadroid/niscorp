import type { ActionDefinition, Step } from '@niscorp/nova';
import { SCREENS } from '../../screens';
import { AREAS } from '../../shell/areas';

// Every answer arrives as the message `answer`, from the server: each area then holds exactly what it lists for that
// area, and nothing where it lists nothing.
const place: Step[] = AREAS.map((area) => ({ reconcile: { canvas: area, to: `$.current.canvases.${area}`, action: 'action', input: 'input', own: 'canvas' as const } }));

const first = SCREENS[0];

export const barAction: ActionDefinition = {
  id: 'answer.bar',
  title: 'You asked',
  description: 'The app’s name, its screens, what was asked and what the model said it did, and the stack of answers: back, forward, or any of them from the list.',
  data: {
    name: 'mira',
    screens: SCREENS.map(({ id, label }) => ({ id, label })),
    current: { question: '', label: first?.label ?? '', screen: first?.id ?? '', arrangement: first?.arrangement ?? '', position: 1, total: 1, stack: [{ position: 1, label: first?.label ?? '' }], canvases: {} },
    listing: false,
    opening: '',
    going: 0,
    saved: '',
  },
  layout: {
    component: 'Bar',
    children: [
      {
        component: 'Row',
        children: [
          { component: 'Text', props: { tone: 'strong' }, children: '{{$.name}}' },
          {
            for: '$.screens',
            as: 'screen',
            key: 'id',
            do: { component: 'Button', ref: 'screen', props: { label: '$screen.label', value: '$screen.id', tone: { $if: { $eq: ['$screen.id', '$.current.screen'] }, $then: 'primary', $else: 'quiet' } } },
          },
        ],
      },
      { if: '$.current.question', then: { component: 'Text', props: { tone: 'muted' }, children: 'You asked: {{$.current.question}}' } },
      { if: '$.current.reasoning', then: { component: 'Text', children: '{{$.current.reasoning}}' } },
      {
        component: 'Row',
        children: [
          { component: 'Button', ref: 'back', props: { label: '←', tone: 'quiet' } },
          { component: 'Button', ref: 'stack', props: { label: '{{$.current.position}} / {{$.current.total}}', tone: 'quiet' } },
          { component: 'Button', ref: 'forward', props: { label: '→', tone: 'quiet' } },
        ],
      },
      {
        if: '$.listing',
        then: {
          component: 'Menu',
          children: [
            {
              for: '$.current.stack',
              as: 'entry',
              key: 'position',
              do: {
                component: 'Button',
                ref: 'entry',
                props: { label: '{{$entry.position}}. {{$entry.label}}', value: '$entry.position', tone: { $if: { $eq: ['$entry.position', '$.current.position'] }, $then: 'primary', $else: 'quiet' } },
              },
            },
          ],
        },
      },
    ],
  },
  endpoints: { open: { fn: 'screens.open' }, back: { fn: 'answers.back' }, forward: { fn: 'answers.forward' }, go: { fn: 'answers.go' }, saved: { fn: 'answers.saved' } },
  triggers: [
    { message: 'answer', do: [{ set: 'listing', value: false }, { set: 'current', value: '@event.payload' }, ...place] },
    { message: 'saved', do: [{ set: 'saved', value: '@event.payload' }, { call: 'saved' }] },
    { event: 'ui:click', ref: 'screen', do: [{ set: 'opening', value: '@event.payload' }, { call: 'open' }] },
    { event: 'ui:click', ref: 'back', do: [{ call: 'back' }] },
    { event: 'ui:click', ref: 'forward', do: [{ call: 'forward' }] },
    { event: 'ui:click', ref: 'stack', do: [{ toggle: 'listing' }] },
    { event: 'ui:click', ref: 'entry', do: [{ set: 'going', value: '@event.payload' }, { call: 'go' }] },
  ],
};
