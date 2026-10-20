import type { ActionDefinition, Step } from '@niscorp/nova';
import { SCREENS } from '../../screens';
import { AREAS } from '../../shell/areas';

// Every answer arrives as the message `answer`, from the server: each area then holds exactly what it lists for that
// area, and nothing where it lists nothing.
const place: Step[] = AREAS.map((area) => ({ reconcile: { canvas: area, to: `$.current.canvases.${area}`, action: 'action', input: 'input', own: 'canvas' as const } }));

export const barAction: ActionDefinition = {
  id: 'answer.bar',
  title: 'You asked',
  description: 'The app’s name, its screens, what was asked, and the way back and forward through the answers.',
  data: {
    name: 'nisc-template-app',
    screens: SCREENS.map(({ id, label }) => ({ id, label })),
    current: { question: '', screen: SCREENS[0]?.id ?? '', position: 0, total: 0, answers: [], canvases: {} },
    opening: '',
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
      {
        if: '$.current.total',
        then: {
          component: 'Row',
          children: [
            { component: 'Button', ref: 'back', props: { label: '←', tone: 'quiet' } },
            { component: 'Text', props: { tone: 'muted' }, children: '{{$.current.position}} / {{$.current.total}}' },
            { component: 'Button', ref: 'forward', props: { label: '→', tone: 'quiet' } },
          ],
        },
      },
    ],
  },
  endpoints: { open: { fn: 'screens.open' }, back: { fn: 'answers.back' }, forward: { fn: 'answers.forward' }, saved: { fn: 'answers.saved' } },
  triggers: [
    { message: 'answer', do: [{ set: 'current', value: '@event.payload' }, ...place] },
    { message: 'saved', do: [{ set: 'saved', value: '@event.payload' }, { call: 'saved' }] },
    { event: 'ui:click', ref: 'screen', do: [{ set: 'opening', value: '@event.payload' }, { call: 'open' }] },
    { event: 'ui:click', ref: 'back', do: [{ call: 'back' }] },
    { event: 'ui:click', ref: 'forward', do: [{ call: 'forward' }] },
  ],
};
