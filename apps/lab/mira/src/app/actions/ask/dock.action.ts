import type { ActionDefinition, Step } from '@niscorp/nova';
import { SCREENS } from '../../screens';
import { AREAS } from '../../shell/areas';

// Every call answers the plan shown into `current`: each area then holds exactly what it lists for that area, and
// nothing where it lists nothing.
const shown: Step[] = [{ set: 'listing', value: false }, ...AREAS.map((area) => ({ reconcile: { canvas: area, to: `$.current.canvases.${area}`, action: 'action', input: 'input', own: 'canvas' as const } }))];

const ask: Step[] = [
  { set: 'asking', value: true },
  { set: 'error', value: '' },
  {
    call: 'ask',
    onSuccess: [{ set: 'asking', value: false }, { set: 'text', value: '' }, ...shown],
    onError: [{ set: 'asking', value: false }, { set: 'error', value: '{{@error.message}}' }],
  },
];

const first = SCREENS[0];

export const dockAction: ActionDefinition = {
  id: 'ask.dock',
  title: 'Dock',
  description:
    'Everything a person does, at the bottom: the screens; the chip naming the answer shown and where it stands, which opens what was asked, what the model said it did, and every answer to go back to; back and forward; and the line to ask in.',
  data: {
    screens: SCREENS.map(({ id, label }) => ({ id, label })),
    current: { question: '', reasoning: '', label: first?.label ?? '', screen: first?.id ?? '', arrangement: first?.arrangement ?? '', position: 1, total: 1, stack: [{ position: 1, label: first?.label ?? '' }], canvases: {} },
    listing: false,
    opening: '',
    going: 0,
    saved: '',
    text: '',
    asking: false,
    error: '',
  },
  layout: {
    component: 'Dock',
    children: [
      {
        component: 'Row',
        children: [
          {
            component: 'Row',
            children: [
              {
                for: '$.screens',
                as: 'screen',
                key: 'id',
                do: { component: 'Button', ref: 'screen', props: { label: '$screen.label', value: '$screen.id', tone: { $if: { $eq: ['$screen.id', '$.current.screen'] }, $then: 'quiet', $else: 'pill' } } },
              },
            ],
          },
          {
            component: 'Row',
            children: [
              { component: 'Button', ref: 'back', props: { label: '←', tone: 'icon' } },
              { component: 'Button', ref: 'stack', props: { label: '{{$.current.label}} · {{$.current.position}}/{{$.current.total}}', tone: 'chip' } },
              { component: 'Button', ref: 'forward', props: { label: '→', tone: 'icon' } },
            ],
          },
        ],
      },
      {
        if: '$.listing',
        then: {
          component: 'Menu',
          children: [
            { if: '$.current.question', then: { component: 'Text', props: { tone: 'strong' }, children: '{{$.current.question}}' } },
            { if: '$.current.reasoning', then: { component: 'Text', props: { tone: 'muted' }, children: '{{$.current.reasoning}}' } },
            {
              for: '$.current.stack',
              as: 'entry',
              key: 'position',
              do: {
                component: 'Button',
                ref: 'entry',
                props: { label: '{{$entry.position}}. {{$entry.label}}', value: '$entry.position', tone: { $if: { $eq: ['$entry.position', '$.current.position'] }, $then: 'quiet', $else: 'pill' } },
              },
            },
          ],
        },
      },
      {
        component: 'Prompt',
        children: [
          { component: 'Input', ref: 'text', model: '$.text', props: { placeholder: 'What would you like to see?', clearOnEnter: true } },
          { component: 'Button', ref: 'send', props: { label: { $if: '$.asking', $then: 'Asking…', $else: 'Send' } } },
          { if: '$.error', then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error}}' } },
        ],
      },
    ],
  },
  endpoints: {
    ask: { fn: 'ask', target: 'current' },
    open: { fn: 'screens.open', target: 'current' },
    back: { fn: 'answers.back', target: 'current' },
    forward: { fn: 'answers.forward', target: 'current' },
    go: { fn: 'answers.go', target: 'current' },
    saved: { fn: 'answers.saved', target: 'current' },
  },
  triggers: [
    { message: 'saved', do: [{ set: 'saved', value: '@event.payload' }, { call: 'saved', onSuccess: shown }] },
    { message: 'ask', do: [{ set: 'text', value: '@event.payload' }, ...ask] },
    { event: 'ui:key', key: 'Enter', ref: 'text', do: ask },
    { event: 'ui:click', ref: 'send', do: ask },
    { event: 'ui:click', ref: 'screen', do: [{ set: 'opening', value: '@event.payload' }, { call: 'open', onSuccess: shown }] },
    { event: 'ui:click', ref: 'back', do: [{ call: 'back', onSuccess: shown }] },
    { event: 'ui:click', ref: 'forward', do: [{ call: 'forward', onSuccess: shown }] },
    { event: 'ui:click', ref: 'stack', do: [{ toggle: 'listing' }] },
    { event: 'ui:click', ref: 'entry', do: [{ set: 'going', value: '@event.payload' }, { call: 'go', onSuccess: shown }] },
  ],
};
