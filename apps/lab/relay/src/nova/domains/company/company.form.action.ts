import type { ActionDefinition } from '@niscorp/nova';
import { companyFormLayout } from './company.form.layout';

// The company form — create AND edit in one action. The `save` endpoint is the
// `company.upsert` mutation, which desugars to insert (no `id`) or update (`id`
// set): a bare push creates, an edit push (with `id` + fields) edits, and the
// form never picks a write. No pickers, so no mount lifecycle. On success it
// announces `companies-changed`, opens the saved company, and pops.
export const companyFormAction: ActionDefinition = {
  id: 'company.form',
  data: {
    modalTitle: 'New company',
    confirmLabel: 'Create',
    id: '', name: '', domain: '', industry: '', size: '',
  },
  layout: companyFormLayout,
  // One write: the `upsert` mutation desugars to insert (id empty) or update
  // (id set) — the form never picks. The header comment's create/edit split lives
  // in the mutation now, not here.
  endpoints: { save: { fn: 'company.upsert', target: 'saved' } },
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    {
      event: 'ui:click',
      ref: 'confirm',
      do: [
        {
          call: 'save',
          onSuccess: [{ emit: { channel: 'companies-changed' } }, { pop: true }],
        },
      ],
    },
  ],
};
