import type { ActionDefinition } from '@niscorp/nova';
import { runsLayout } from './runs.layout';
import { panelTriggers } from './panel';

// EVERY MODEL RUN: what went out, what it called, what came back, what it cost.
//
// moss records one row per run through the app's own governed wire, so a row is
// pinned to whoever the run was for. This is the one place that reads across
// principals, which is the whole point of the view and the reason it lives behind
// the operator key.
//
// It is not the assistant's pane. `agent_id` and `agent_path` are dimensions on
// the record, so a second agent shipped tomorrow appears here with no edit — the
// assistant is simply the only thing running today.
//
// Nothing is aggregated on write. Per agent, per person, per model and the raw
// feed are four GROUP BYs over one table, so a question nobody has asked yet is a
// query rather than a migration.
//
// No prices. Per-model rates move and rot; tokens are the honest unit, and the
// row keeps provider and model so pricing can be layered on later.
export const runsAction: ActionDefinition = {
  id: 'admin.runs',
  title: 'Agent runs',
  data: { runs: {}, open: {}, loading: true, error: '' },
  layout: runsLayout,
  endpoints: { load: { fn: 'admin.runs', target: 'runs', errorTarget: 'error' } },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    // The row carries its whole exchange, so opening one is data already in hand
    // rather than a second read.
    { event: 'ui:click', ref: 'open', do: [{ set: 'open', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'close', do: [{ clear: 'open' }] },
    ...panelTriggers,
  ],
};
