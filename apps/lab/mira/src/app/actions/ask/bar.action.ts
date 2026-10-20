import type { ActionDefinition, Step } from '@niscorp/nova';
import { AREAS } from '../../shell/areas';

// Every answer arrives as the message `answer`, from the server: each area then holds exactly what it lists for that
// area, and nothing where it lists nothing.
const place: Step[] = AREAS.map((area) => ({ reconcile: { canvas: area, to: `$.current.canvases.${area}`, action: 'action', input: 'input', own: 'canvas' as const } }));

export const barAction: ActionDefinition = {
  id: 'answer.bar',
  title: 'You asked',
  description: 'The app’s name, what was asked, and the way back and forward through the answers.',
  data: { name: 'mira', current: { question: '', position: 0, total: 0, answers: [], canvases: {} } },
  layout: {
    component: 'Bar',
    children: [
      { component: 'Text', props: { tone: 'strong' }, children: '{{$.name}}' },
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
  endpoints: { back: { fn: 'answers.back' }, forward: { fn: 'answers.forward' } },
  triggers: [
    { message: 'answer', do: [{ set: 'current', value: '@event.payload' }, ...place] },
    { event: 'ui:click', ref: 'back', do: [{ call: 'back' }] },
    { event: 'ui:click', ref: 'forward', do: [{ call: 'forward' }] },
  ],
};
