import type { ActionDefinition } from '@niscorp/nova';
import { catalogLayout } from './catalog.layout';
import { panelTriggers } from './panel';

export const catalogAction: ActionDefinition = {
  id: 'admin.catalog',
  title: 'Catalog',
  data: { rows: [], filter: '', selected: {}, detail: {}, loading: true, working: false, error: '' },
  layout: catalogLayout,
  endpoints: {
    load: { fn: 'admin.catalog', target: 'rows', errorTarget: 'error' },
    inspect: { fn: 'admin.definition', target: 'detail', errorTarget: 'error' },
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
            { push: { action: 'admin.preview', with: ['preview'], input: { previewTitle: '{{$.selected.title}}', previewId: '{{$.selected.id}}' } } },
          ],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    ...panelTriggers,
  ],
};
