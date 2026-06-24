import type { ActionDefinition } from '@niscorp/nova';
import { companyFormLayout } from './company.form.layout';

// The company form — create AND edit in one action (Approach B: `$.saveFn` picks
// the write). Bare push is CREATE (`saveFn` defaults to `company.create`, fields
// empty); an edit push overrides `saveFn:'company.update'` + the `id` and fields.
// No pickers, so no mount lifecycle. On success it announces `companies-changed`,
// opens the saved company in the detail rail, and pops.
export const companyFormAction: ActionDefinition = {
  id: 'company.form',
  data: {
    saveFn: 'company.create',
    modalTitle: 'New company',
    confirmLabel: 'Create',
    id: '', name: '', domain: '', industry: '', size: '',
  },
  layout: companyFormLayout,
  endpoints: { save: { fn: '{{$.saveFn}}', target: 'saved' } },
  triggers: [
    {
      event: 'ui:click',
      ref: 'confirm',
      do: [
        {
          call: 'save',
          onSuccess: [
            { emit: { channel: 'companies-changed' } },
            { replace: { action: 'company', canvas: 'detail', input: { id: '$.saved.id' } } },
            { pop: true },
          ],
        },
      ],
    },
  ],
};
