import type { ActionDefinition } from '@niscorp/nova';
import { companyLayout } from './company.layout';

// Pushed onto the `detail` canvas with `input: { id }`. On mount, `loadCompany`
// fills `$.view` with the company record + its people + open deals. Close pops;
// a `nav` message self-closes. `open-contact` / `open-deal` swap the detail to
// that record — cross-linking by id.
export const companyAction: ActionDefinition = {
  id: 'company',
  data: { id: '', view: { record: {}, contacts: [], deals: [] }, loading: true },
  layout: companyLayout,
  endpoints: {
    loadRecord: { fn: 'company.byId', target: 'view.record' },
    loadContacts: { fn: 'company.contacts', target: 'view.contacts' },
    loadDeals: { fn: 'company.deals', target: 'view.deals' },
  },
  lifecycle: { mount: [{ call: 'loadRecord', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadContacts' }, { call: 'loadDeals' }] },
  // Cross-links switch `main` (+ emit `screen-*`) and THEN swap the panel. The
  // self-canvas `detail` replace must be LAST: it pops this action and aborts
  // the rest of the trigger, so anything after it would be silently skipped.
  triggers: [
    { event: 'ui:click', ref: 'close', do: [{ emit: { channel: 'deselect' } }, { pop: true }] },
    { message: 'nav', do: [{ pop: true }] },
    // The list deleted a record → close this panel (it may be showing the now-gone
    // company; the list already cleared the row highlight via `deselect`).
    { message: 'detail-close', do: [{ pop: true }] },
    // Edit opens the company form seeded from the loaded record; `companies-changed`
    // (emitted by the save) re-reads this panel.
    {
      event: 'ui:click',
      ref: 'edit',
      do: [
        {
          push: {
            action: 'company.form',
            canvas: 'modal',
            with: ['modal'],
            input: { saveFn: 'company.update', modalTitle: 'Edit company', confirmLabel: 'Save', id: '$.view.record.company_id', name: '$.view.record.name', domain: '$.view.record.domain', industry: '$.view.record.industry', size: '$.view.record.size' },
          },
        },
      ],
    },
    { message: 'companies-changed', do: [{ call: 'loadRecord' }] },
    {
      event: 'ui:click',
      ref: 'open-contact',
      do: [
        { replace: { action: 'contacts', canvas: 'main', input: { highlight_id: '@event.payload' } } },
        { emit: { channel: 'screen-contacts' } },
        { replace: { action: 'contact', canvas: 'detail', input: { id: '@event.payload' } } },
      ],
    },
    // Open one of the company's deals in the deal workspace (the one deal view),
    // as a modal over this panel.
    { event: 'ui:click', ref: 'open-deal', do: [{ push: { action: 'deal', canvas: 'modal', input: { id: '@event.payload' } } }] },
  ],
};
