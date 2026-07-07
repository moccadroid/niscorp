import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { contactLayout } from './contact.layout';
import { contactByIdPrism, contactDealsPrism, contactTasksPrism, contactActivityPrism } from './contact.prism';
import { setDoneTaskPrism } from '../task/tasks.prism';
import { resultPrism } from '@relay/nova/shared/result.prism';

// Pushed onto the `detail` canvas with `input: { id }` (from a contacts row, a
// company's people list, or a deep URL). On mount it loads the contact by id
// into `$.view`. Close pops it; a `nav` message (sidebar screen change) makes an
// open detail self-close. `open-company` cross-links to the contact's company:
// it switches `main` to the companies list (+ emits `screen-companies`) and THEN
// swaps the detail. Order matters: replacing the `detail` pops THIS action and
// aborts the rest of the trigger, so the self-canvas replace must come LAST.
export const contactAction: ActionDefinition = {
  id: 'contact',
  // Stack-nav label — the chip + its depth menu read `instance.title`.
  title: '{{$.record.name}}',
  data: { id: '', record: {}, deals: [], tasks: [], activity: [], loading: true, toggleId: '', toggleDone: false, panelClass: 'rl-dialog--wide' },
  layout: contactLayout,
  // Four reads, each into a top-level slot: the record, plus the contact's deals, open
  // tasks and recent activity — the same section structure as the company profile
  // and the deal workspace.
  endpoints: {
    load:         { url: '/api/contacts/vex?cache=use', method: 'POST', request: contactByIdPrism,    response: resultPrism, target: 'record' },
    loadDeals:    { url: '/api/contacts/vex?cache=use', method: 'POST', request: contactDealsPrism,   response: resultPrism, target: 'deals' },
    loadTasks:    { url: '/api/contacts/vex?cache=use', method: 'POST', request: contactTasksPrism,   response: resultPrism, target: 'tasks' },
    loadActivity: { url: '/api/contacts/vex?cache=use', method: 'POST', request: contactActivityPrism, response: resultPrism, target: 'activity' },
    setDone:      { url: '/api/tasks/vex',              method: 'POST', request: setDoneTaskPrism },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadDeals' }, { call: 'loadTasks' }, { call: 'loadActivity' }] },
  triggers: [
    { message: 'nav', do: [{ pop: true }] },
    // The list deleted a record → close this panel (it may be showing the now-gone
    // contact; the list already cleared the row highlight via `deselect`).
    { message: 'detail-close', do: [{ pop: true }] },
    // Edit opens the contact form seeded from the loaded record (the form's own
    // shape — `name` is the concatenated display name; the input prism re-splits
    // it on save). `contacts-changed` (emitted by the save) re-reads here.
    {
      event: 'ui:click',
      ref: 'edit',
      do: [
        {
          push: {
            action: 'contact.form',
            canvas: 'modal',
            with: ['modal'],
            input: { modalTitle: 'Edit contact', confirmLabel: 'Save', id: '$.record.contact_id', name: '$.record.name', email: '$.record.email', phone: '$.record.phone', title: '$.record.title', company: '$.record.company.company_id' },
          },
        },
      ],
    },
    { message: 'contacts-changed', do: [{ call: 'load' }] },
    // Complete one of the contact's open tasks inline; re-read its list (and tell
    // the rest of the app) on success.
    { event: 'ui:click', ref: 'complete-task', do: [{ set: 'toggleId', value: '@event.payload' }, { set: 'toggleDone', value: true }, { call: 'setDone', onSuccess: [{ emit: { channel: 'tasks-changed' } }] }] },
    { message: 'tasks-changed', do: [{ call: 'loadTasks' }] },
    // Cross-links push onto THIS canvas (the stack), so the current record stays
    // beneath and Back returns to it — `main` is untouched.
    { event: 'ui:click', ref: 'open-deal', do: [{ push: { action: 'deal', input: { id: '@event.payload' } } }] },
    { event: 'ui:click', ref: 'open-company', do: [{ push: { action: 'company', input: { id: '@event.payload' } } }] },
  ],
};

// Settable inputs an opener may pass — authored in zod, exported as JSON Schema.
export const contactInputSchema = z.toJSONSchema(
  z.object({ id: z.string().describe('contact id (use find_records to resolve a name to an id)') }),
);
