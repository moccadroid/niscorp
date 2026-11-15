import type { ActionDefinition, Step } from '@niscorp/nova';
import { SCREENS } from '../../screens';
import { dockLayout } from './dock.layout';

const send: Step[] = [{ set: 'error', value: '' }, { call: 'ask', onError: [{ set: 'error', value: '{{@error.message}}' }] }];
// What was typed is what is asked, and the line is empty again at once: the answer shows in the conversation.
const ask: Step[] = [{ set: 'asked', value: '{{$.text}}' }, { set: 'text', value: '' }, ...send];

const open: Step[] = [{ set: 'opening', value: '@event.payload' }, { call: 'open' }];

export const dockAction: ActionDefinition = {
  id: 'ask.dock',
  title: 'Dock',
  description: 'Everything a person does, at the bottom: the conversation, the screens, and the line to ask in.',
  data: {
    screens: SCREENS.map(({ id, label }) => ({ id, label })),
    shown: { screen: SCREENS[0].id },
    opening: '',
    text: '',
    asked: '',
    error: '',
  },
  layout: dockLayout,
  endpoints: {
    ask: { fn: 'ask' },
    open: { fn: 'screens.open', target: 'shown' },
  },
  triggers: [
    { message: 'ask', do: [{ set: 'asked', value: '@event.payload' }, ...send] },
    { message: 'open', do: open },
    { event: 'ui:key', key: 'Enter', ref: 'text', do: ask },
    { event: 'ui:click', ref: 'send', do: ask },
    { event: 'ui:click', ref: 'screen', do: open },
  ],
};
