import type { ActionDefinition } from '@niscorp/nova';
import { shellsLayout } from './shells.layout';
import { panelTriggers } from './panel';

// LIVING SHELLS — the durable per-principal server shells moss is holding, and
// what is mounted on each of their canvases.
//
// moss owns the shell map and enumerates nothing, so this is the one thing in
// the tool the app had to be taught to remember: a note per session, taken at
// the one hook an app gets per living shell. Best-effort by construction, and
// the honest version is `shells.list()` in moss.
//
// It is deliberately thin, and the thinness is the design: principal, audience,
// and the action ids on their canvases. Not what they typed, not what they
// read. The seam has no route that could answer those, so no amount of wanting
// them here would produce them.
export const shellsAction: ActionDefinition = {
  id: 'admin.shells',
  title: 'Shells',
  data: { shells: {}, selected: {}, loading: true, error: '' },
  layout: shellsLayout,
  endpoints: { load: { fn: 'admin.shells', target: 'shells', errorTarget: 'error' } },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [{ event: 'ui:click', ref: 'pick', do: [{ set: 'selected', value: '@event.payload' }] }, ...panelTriggers],
};
