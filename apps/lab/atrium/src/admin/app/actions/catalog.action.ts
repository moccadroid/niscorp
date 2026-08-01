import type { ActionDefinition } from '@niscorp/nova';
import { catalogLayout } from './catalog.layout';
import { panelTriggers } from './panel';

// THE CATALOG — every definition the running server would serve to somebody,
// and what each one actually is.
//
// An action is a small document: declared data, an input contract, endpoints,
// triggers, a layout. All of it is JSON, all of it is already on the wire, and
// none of it was readable anywhere without opening a file — including for the
// ones that never were files. Half this catalog arrived as `bundle_actions`
// rows from a vendor's service, and until now the only way to see what one of
// those contains was to query the database and read a JSON blob.
//
// Then the part worth building the pane for: PREVIEW. The layout comes back as
// data, so we register it onto this shell and render it, with the action's own
// declared defaults and no endpoints. It is the surface as the app would draw
// it before anything loads — which is exactly the state you cannot see by using
// the app, because by the time you have looked, it has loaded.
export const catalogAction: ActionDefinition = {
  id: 'admin.catalog',
  title: 'Catalog',
  data: { rows: [], filter: '', selected: {}, detail: {}, loading: true, working: false, error: '' },
  layout: catalogLayout,
  endpoints: {
    load: { fn: 'admin.catalog', target: 'rows', errorTarget: 'error' },
    inspect: { fn: 'admin.definition', target: 'detail', errorTarget: 'error' },
    // Prepares the render: fetches the whole definition, teaches this shell the
    // components its layout names, and registers it as `admin.preview`. The
    // push happens after, as an ordinary effect — navigation stays in the
    // action, where it can be read.
    prepare: { fn: 'admin.preview', errorTarget: 'error' },
  },
  lifecycle: {
    mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { set: 'error', value: '' }], onError: [{ set: 'loading', value: false }] }],
  },
  triggers: [
    { event: 'ui:model', ref: 'filter', do: [{ set: 'filter', value: '@event.value' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'pick', do: [{ set: 'selected', value: '@event.payload' }, { set: 'detail', value: {} }, { call: 'inspect' }] },
    {
      event: 'ui:click',
      ref: 'render',
      do: [
        { set: 'working', value: true },
        {
          call: 'prepare',
          onSuccess: [
            { set: 'working', value: false },
            // Composed with the preview fragment, which supplies the chrome —
            // the pushed layout is the app's, not ours, so the frame cannot
            // live inside it.
            { push: { action: 'admin.preview', with: ['preview'], input: { previewTitle: '{{$.selected.title}}', previewId: '{{$.selected.id}}' } } },
          ],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    ...panelTriggers,
  ],
};
