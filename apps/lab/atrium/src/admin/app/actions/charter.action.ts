import type { ActionDefinition } from '@niscorp/nova';
import { charterLayout } from './charter.layout';
import { panelTriggers } from './panel';

// THE CHARTER, compiled — the artifact moss builds on every boot and keeps to
// itself.
//
// Two halves of one document. Roles are what it says; principals are who wears
// them, and each one's resolved catalog is what it compiles to for them — ring
// 1, the ceiling no composition can exceed. The app answers this for the caller
// alone, once, at login, which is correct and also why nobody could ever see the
// whole document resolved. Here it is one pane.
//
// Read down a principal for their ceiling. Read the other way — tap an action,
// see who may hold it — for the question that catches a mistake: an action
// resolving for an audience you did not intend is invisible from inside the app
// and obvious here.
export const charterAction: ActionDefinition = {
  id: 'admin.charter',
  title: 'Charter',
  data: { charter: {}, selected: {}, actions: [], probe: {}, holders: [], loading: true, error: '' },
  layout: charterLayout,
  endpoints: {
    load: { fn: 'admin.charter', target: 'charter', errorTarget: 'error' },
    holders: { fn: 'admin.holders', target: 'holders', errorTarget: 'error' },
  },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    // The row carries its own resolved catalog, so opening a principal costs no
    // second call — comparing actors is the point of the pane, and a round trip
    // per actor would make that a chore.
    {
      event: 'ui:click',
      ref: 'pick',
      do: [{ set: 'selected', value: '@event.payload' }, { set: 'actions', value: '@event.payload.actions' }, { set: 'holders', value: [] }, { set: 'probe', value: {} }],
    },
    { event: 'ui:click', ref: 'probe', do: [{ set: 'probe', value: '@event.payload' }, { call: 'holders' }] },
    ...panelTriggers,
  ],
};
