import { XRAY_CHANNEL } from './intent-trace.action';
import type { ActionDefinition } from '@niscorp/nova';
import { directorDeckLayout } from './director-deck.layout';

export const DIRECTOR_DECK_ID = 'director.deck';
export const CLOCK_CHANNEL = 'clock-changed';

export const directorDeckAction: ActionDefinition = {
  id: DIRECTOR_DECK_ID,
  title: 'Director',
  description: 'Plays Saturday evening as a feed of real writes: play, pause and speed, with the festival clock.',
  data: { shown: false, command: 'status', deck: { playing: false, finished: false, status: 'ready', speed: 60, time: '18:00', day: 'sat', played: 0, of: 0 } },
  layout: directorDeckLayout,
  endpoints: { run: { fn: 'encore.director', target: 'deck' } },
  lifecycle: { mount: [{ call: 'run' }] },
  triggers: [
    { message: XRAY_CHANNEL, do: [{ set: 'shown', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'play', do: [{ set: 'command', value: 'play' }, { call: 'run' }] },
    { event: 'ui:click', ref: 'pause', do: [{ set: 'command', value: 'pause' }, { call: 'run' }] },
    { event: 'ui:click', ref: 'replay', do: [{ set: 'command', value: 'replay' }, { call: 'run' }] },
    { event: 'ui:click', ref: 'faster', do: [{ set: 'command', value: 'faster' }, { call: 'run' }] },
    { event: 'ui:click', ref: 'slower', do: [{ set: 'command', value: 'slower' }, { call: 'run' }] },
    { message: CLOCK_CHANNEL, do: [{ set: 'command', value: 'status' }, { call: 'run' }] },
  ],
};
