import type { ActionDefinition } from '@niscorp/nova';
import { assistRailLayout } from './assist-rail.layout';
import { THREAD_CHANNEL } from './assist-answer.action';

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
