import type { ActionDefinition } from '@niscorp/nova';
import { timelineLayout } from './timeline.layout';
import { panelTriggers } from './panel';

// WHAT THE APP IS DOING, right now.
//
// nova fires an event for every endpoint a shell's actions call — `fn:` and
// HTTP alike, with the outcome and the duration. It has always been there; on
// the server nothing was listening. The seam keeps the last three hundred.
//
// NAMES AND TIMINGS ONLY, and that is a property of the seam rather than a
// promise here: the record it keeps has no field that could hold a request body
// or a response. You can see that Rosa's board called `issues/open` and that it
// took 4ms. What came back is not in the feed, and there is no route that would
// serve it.
//
// It re-reads on demand rather than streaming. A feed that pushed would need a
// second channel from the app to this tool, and the whole posture of the stack
// is that the database is the bus and freshness is a re-read.
export const timelineAction: ActionDefinition = {
  id: 'admin.timeline',
  title: 'Timeline',
  data: { timeline: {}, principal: {}, loading: true, error: '' },
  layout: timelineLayout,
  endpoints: { load: { fn: 'admin.timeline', target: 'timeline', errorTarget: 'error' } },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'principal', value: '@event.payload' }, { call: 'load' }] },
    ...panelTriggers,
  ],
};
