import type { ActionDefinition } from '@niscorp/nova';
import { newCompanyLayout } from './new-company.layout';

// "Create a company" — pushed onto the `modal` canvas `with: ['modal']` from the
// Companies screen's `new` handler. The data IS the form (fields bound directly,
// the form's own shape); `create` runs the `company.create` mutation, whose
// input prism maps that data to the DB columns and writes it. On success we
// announce `companies-changed` (the list listens and re-reads — reads run live,
// so the new row appears) and THEN pop. Order matters: `pop` disposes this
// runtime, so the emit must fire first. Close/cancel come from the fragment.
export const newCompanyAction: ActionDefinition = {
  id: 'new-company',
  data: { name: '', domain: '', industry: '', size: '', modalTitle: 'New company', confirmLabel: 'Create' },
  layout: newCompanyLayout,
  endpoints: { create: { fn: 'company.create', target: 'created' } },
  triggers: [
    // Write → announce (list re-reads) → open the new record in the detail panel
    // (the `RETURNING` row's id) → close the modal. emit before pop (pop disposes
    // this runtime); the detail `replace` is a different canvas, so it survives.
    {
      event: 'ui:click',
      ref: 'confirm',
      do: [
        {
          call: 'create',
          onSuccess: [
            { emit: { channel: 'companies-changed' } },
            { replace: { action: 'company-detail', canvas: 'detail', input: { id: '$.created.id' } } },
            { pop: true },
          ],
        },
      ],
    },
  ],
};
