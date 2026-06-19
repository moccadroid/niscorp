import type { ActionDefinition } from '@niscorp/nova';
import { newDealLayout } from './new-deal.layout';

// "Create a deal" — pushed `with: ['modal']` from Deals/board/Home. On mount it
// loads the company / stage / contact pickers (real id/name options). The data
// IS the form; the selects hold FK ids. `create` writes via `deal.create`, then
// REPLACES the form with the deal workspace (deal-modal — the one deal view) for
// the new id, and announces `deals-changed` so the list/board reflect it.
export const newDealAction: ActionDefinition = {
  id: 'new-deal',
  data: { title: '', company: '', stage: '', contact: '', value: '', close_date: '', companyOptions: [], stageOptions: [], contactOptions: [], modalTitle: 'New deal', confirmLabel: 'Create' },
  layout: newDealLayout,
  endpoints: {
    loadCompanies: { fn: 'options.companies', target: 'companyOptions' },
    loadStages: { fn: 'options.stages', target: 'stageOptions' },
    loadContacts: { fn: 'options.contacts', target: 'contactOptions' },
    create: { fn: 'deal.create', target: 'created' },
  },
  lifecycle: { mount: [{ call: 'loadCompanies' }, { call: 'loadStages' }, { call: 'loadContacts' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'confirm',
      do: [
        {
          call: 'create',
          onSuccess: [
            { emit: { channel: 'deals-changed' } },
            { replace: { action: 'deal-modal', canvas: 'modal', input: { id: '$.created.id' } } },
          ],
        },
      ],
    },
  ],
};
