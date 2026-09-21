import { XRAY_CHANNEL } from './intent-trace.action';
import type { ActionDefinition } from '@niscorp/nova';
import { directorDeckLayout } from './director-deck.layout';

// PLAY SATURDAY EVENING. The director is a feed — a principal of its own, with a
// role that may move counts, report and close incidents, fail a scanner and
// advance the clock, and nothing else (charter.ts). These are the operator's
// controls over it: play, pause, and how fast.
//
// Everything the director does enters by the vex door, as a write, exactly as a
// real scanner would — so this card is the ONLY thing in the room that knows a
// rehearsal is a rehearsal. It re-reads its state when the clock moves.
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
    // Shown only while x-ray's panel is open — told by the panel, over a channel.
    { message: XRAY_CHANNEL, do: [{ set: 'shown', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'play', do: [{ set: 'command', value: 'play' }, { call: 'run' }] },
    { event: 'ui:click', ref: 'pause', do: [{ set: 'command', value: 'pause' }, { call: 'run' }] },
    // A finished evening can be put back and played again — by the feed, through
    // the feed's own writes (server/director/director.ts `reset`).
    { event: 'ui:click', ref: 'replay', do: [{ set: 'command', value: 'replay' }, { call: 'run' }] },
    { event: 'ui:click', ref: 'faster', do: [{ set: 'command', value: 'faster' }, { call: 'run' }] },
    { event: 'ui:click', ref: 'slower', do: [{ set: 'command', value: 'slower' }, { call: 'run' }] },
    { message: CLOCK_CHANNEL, do: [{ set: 'command', value: 'status' }, { call: 'run' }] },
  ],
};
