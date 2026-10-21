import type { ActionDefinition, Step } from '@niscorp/nova';
import { SCREENS } from '../../screens';
import { AREAS } from '../../shell/areas';
import { dockLayout } from './dock.layout';

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

const open: Step[] = [{ set: 'opening', value: '@event.payload' }, { call: 'open', onSuccess: shown }];

const [first] = SCREENS;

export const dockAction: ActionDefinition = {
  id: 'ask.dock',
  title: 'Dock',
  description:
    'Everything a person does, at the bottom: the screens; the chip naming the answer shown and where it stands, which opens what was asked, what the model said it did, and every answer to go back to; back and forward; and the line to ask in.',
  data: {
    screens: SCREENS.map(({ id, label }) => ({ id, label })),
    current: { question: '', response: '', label: first.label, screen: first.id, arrangement: first.arrangement, position: 1, total: 1, stack: [{ position: 1, label: first.label }], canvases: {} },
    listing: false,
    opening: '',
    going: 0,
    text: '',
    asking: false,
    error: '',
  },
  layout: dockLayout,
  endpoints: {
    ask: { fn: 'ask', target: 'current' },
    open: { fn: 'screens.open', target: 'current' },
    back: { fn: 'answers.back', target: 'current' },
    forward: { fn: 'answers.forward', target: 'current' },
    go: { fn: 'answers.go', target: 'current' },
    current: { fn: 'answers.current', target: 'current' },
  },
  triggers: [
    { message: 'answer-moved', do: [{ call: 'current', onSuccess: shown }] },
    { message: 'ask', do: [{ set: 'text', value: '@event.payload' }, ...ask] },
    { message: 'open', do: open },
    { event: 'ui:key', key: 'Enter', ref: 'text', do: ask },
    { event: 'ui:click', ref: 'send', do: ask },
    { event: 'ui:click', ref: 'screen', do: open },
    { event: 'ui:click', ref: 'back', do: [{ call: 'back', onSuccess: shown }] },
    { event: 'ui:click', ref: 'forward', do: [{ call: 'forward', onSuccess: shown }] },
    { event: 'ui:click', ref: 'stack', do: [{ toggle: 'listing' }] },
    { event: 'ui:click', ref: 'entry', do: [{ set: 'going', value: '@event.payload' }, { call: 'go', onSuccess: shown }] },
  ],
};
