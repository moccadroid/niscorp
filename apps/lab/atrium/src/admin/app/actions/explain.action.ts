import type { ActionDefinition } from '@niscorp/nova';
import { explainLayout } from './explain.layout';
import { panelTriggers } from './panel';

// WHY CAN THIS PRINCIPAL NOT SEE THAT?
//
// The support question, and until now the only way to answer it was to read
// four tables by hand and hold the charter in your head. Every factor already
// crosses the seam; nothing here computes a new truth, it just puts the chain
// in one line and says which link broke.
//
// The chain, in the order the app applies it:
//
//   audience — the slot belongs to a different audience entirely
//   charter  — the ceiling: is the action even in this principal's ring 1
//   resolver — property_slots for their property, and its own `reason`, which
//              already distinguishes withdrawn-by-us / integration-not-run-here
//              / not-in-the-offer / switched-off-by-the-property
//   stay     — the slot applies to some stay states and not others
//
// STAY STATE IS PICKED, not read. Asking "what would an arriving guest see"
// is the more useful question anyway, and it means this pane never touches a
// real stay — the one factor that would have required a hotel's row is a
// dropdown instead.
export const explainAction: ActionDefinition = {
  id: 'admin.explain',
  title: 'Explain',
  data: { explain: {}, principal: {}, state: 'any', loading: true, error: '' },
  layout: explainLayout,
  endpoints: { load: { fn: 'admin.explain', target: 'explain', errorTarget: 'error' } },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'principal', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'state', do: [{ set: 'state', value: '@event.payload' }, { call: 'load' }] },
    ...panelTriggers,
  ],
};
