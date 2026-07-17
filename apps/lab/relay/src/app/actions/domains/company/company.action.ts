import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { companyLayout } from './company.layout';
import { companyByIdPrism, companyContactsPrism, companyDealsPrism } from './company.prism';

// Pushed onto the `detail` canvas with `input: { id }`. On mount, `loadCompany`
// fills `$.view` with the company record + its people + open deals. Close pops;
// a `nav` message self-closes. `open-contact` / `open-deal` swap the detail to
// that record — cross-linking by id.
export const companyAction: ActionDefinition = {
  id: 'crm.company.view',
  // Stack-nav label — the chip + its depth menu read `instance.title`.
  title: '{{$.record.name}}',
  data: { id: '', record: {}, contacts: [], deals: [], loading: true, panelSize: 'wide' },
  layout: companyLayout,
  endpoints: {
    loadRecord:   { url: '/api/companies/vex', method: 'POST', request: companyByIdPrism, target: 'record' },
    loadContacts: { url: '/api/companies/vex', method: 'POST', request: companyContactsPrism, target: 'contacts' },
    loadDeals:    { url: '/api/companies/vex', method: 'POST', request: companyDealsPrism, target: 'deals' },
  },
  lifecycle: { mount: [{ call: 'loadRecord', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadContacts' }, { call: 'loadDeals' }] },
  // Cross-links switch `main` (+ emit `screen-*`) and THEN swap the panel. The
  // self-canvas `detail` replace must be LAST: it pops this action and aborts
  // the rest of the trigger, so anything after it would be silently skipped.
  triggers: [
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
            action: 'crm.company.form',
            canvas: 'modal',
            with: ['modal'],
            input: { modalTitle: 'Edit company', confirmLabel: 'Save', id: '$.record.company_id', name: '$.record.name', domain: '$.record.domain', industry: '$.record.industry', size: '$.record.size' },
          },
        },
      ],
    },
    { message: 'companies-changed', do: [{ call: 'loadRecord' }] },
    // Cross-links push onto THIS canvas (the stack); Back returns to this company.
    { event: 'ui:click', ref: 'open-contact', do: [{ push: { action: 'crm.contact.view', input: { id: '@event.payload' } } }] },
    { event: 'ui:click', ref: 'open-deal', do: [{ push: { action: 'crm.deal.view', input: { id: '@event.payload' } } }] },
  ],
};

// Settable inputs an opener may pass — authored in zod, exported as JSON Schema.
export const companyInputSchema = z.toJSONSchema(
  z.object({ id: z.string().describe('company id (use find_records to resolve a name to an id)') }),
);
