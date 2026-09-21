import type { ActionDefinition } from '@niscorp/nova';
import { assistRailLayout } from './assist-rail.layout';
import { THREAD_CHANNEL } from './assist-answer.action';

// THE RAIL — the log of the SHIFT, not of a chat.
//
// One line per turn, newest nearest the line: what was said, and what came of
// it in the operator's own terms — "moved Nova Kestrel → The Tent, 21:00 · not
// submitted" for a sentence Jev handled alone, the first sentence of an answer
// for one the agent took, "pressed: Move a set" for a button. It is always
// here, whether or not the sentence on the line wants an agent: the exchange
// above it resets with the room, and this does not.
//
// ROWS, NOT STATE. `entries` is loaded through a declared endpoint at mount and
// again whenever the loop says the thread changed; nothing here remembers a
// conversation. Clicking an entry opens it (one at a time); "new thread" is the
// operator's click and the only thing that ever ends one.
//
// No `input` and no placement: it is furniture, never a question.
export const ASSIST_RAIL_ID = 'assist.rail';

export const assistRailAction: ActionDefinition = {
  id: ASSIST_RAIL_ID,
  title: 'Earlier',
  description: 'The turns of this shift so far, one line each, newest first: what the operator said and what either the cards or the agent made of it. Click one to read it in full.',
  data: { entries: [], open: '', thread: '', expanded: false },
  layout: assistRailLayout,
  endpoints: {
    loadThread: { fn: 'encore.thread', target: 'entries' },
    newThread: { fn: 'encore.newThread', target: 'thread' },
  },
  lifecycle: { mount: [{ call: 'loadThread' }] },
  triggers: [
    { event: 'ui:click', ref: 'earlierOpen', do: [{ set: 'expanded', value: true }] },
    { event: 'ui:click', ref: 'earlierShut', do: [{ set: 'expanded', value: false }] },
    { event: 'ui:click', ref: 'entry', do: [{ set: 'open', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'newThread', do: [{ set: 'open', value: '' }, { call: 'newThread', onSuccess: [{ call: 'loadThread' }] }] },
    { message: THREAD_CHANNEL, do: [{ call: 'loadThread' }] },
  ],
};
