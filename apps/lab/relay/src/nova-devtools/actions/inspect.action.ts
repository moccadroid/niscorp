import type { ActionDefinition } from '@niscorp/nova';
import { inspectLayout } from './inspect.layout';

// The per-instance inspector — pushed onto the `devtools` canvas (over the
// dock) by a chip click or the dock's shell tab, ALWAYS `with:
// ['devtools.frame']` (the shared panel/title/✕ chrome; its ✕ pops back to the
// dock). `describe` derives the whole display model (summaries, classified
// audit, resolved layout) in one fn call; the taps publish `devtools:watched`
// whenever the watched instance's data changes, so the view stays live by
// re-describing.
export const inspectAction: ActionDefinition = {
  id: 'devtools.inspect',
  name: 'Nova devtools inspector',
  title: '⚙ {{$.target.id}}',
  data: {
    instanceId: '',
    openJson: '',
    target: { found: false, id: '', endpoints: [], triggers: [], lifecycle: [], issues: [] },
  },
  input: {
    type: 'object',
    properties: { instanceId: { type: 'string', description: 'Instance to inspect.' } },
  },
  layout: inspectLayout,
  endpoints: {
    describe: { fn: 'devtools.describe', target: 'target' },
    logInstance: { fn: 'devtools.logInstance' },
  },
  lifecycle: {
    // The fragment's header binds `$.frameTitle`; fill it once the target is known.
    mount: [{ call: 'describe', onSuccess: [{ set: 'frameTitle', value: '⚙ {{$.target.id}}' }] }],
  },
  triggers: [
    { message: 'devtools:watched', do: [{ call: 'describe' }] },
    { event: 'ui:click', ref: 'refresh', do: [{ call: 'describe' }] },
    { event: 'ui:click', ref: 'log-instance', do: [{ call: 'logInstance' }] },
    // One ref toggles every JSON section via the Button `value` payload.
    { event: 'ui:click', ref: 'json', do: [{ set: 'openJson', value: '@event.payload' }] },
  ],
};
