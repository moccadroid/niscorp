import type { ActionDefinition } from '@niscorp/nova';
import { contactLayout } from './contact.layout';

// Pushed onto the `detail` canvas with `input: { id }` (from a contacts row, a
// company's people list, or a deep URL). On mount it loads the contact by id
// into `$.view`. Close pops it; a `nav` message (sidebar screen change) makes an
// open detail self-close. `open-company` cross-links to the contact's company:
// it switches `main` to the companies list (+ emits `screen-companies`) and THEN
// swaps the detail. Order matters: replacing the `detail` pops THIS action and
// aborts the rest of the trigger, so the self-canvas replace must come LAST.
export const contactAction: ActionDefinition = {
  id: 'contact',
  data: { id: '', view: { record: {}, deals: [], tasks: [], activity: [] }, loading: true, toggleId: '', toggleDone: false },
  layout: contactLayout,
  // Four reads into slots of `$.view`: the record, plus the contact's deals, open
  // tasks and recent activity — the same section structure as the company profile
  // and the deal workspace.
  endpoints: {
    load: { fn: 'contact.byId', target: 'view.record' },
    loadDeals: { fn: 'contact.deals', target: 'view.deals' },
    loadTasks: { fn: 'contact.tasks', target: 'view.tasks' },
    loadActivity: { fn: 'contact.activity', target: 'view.activity' },
    setDone: { fn: 'task.setDone' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadDeals' }, { call: 'loadTasks' }, { call: 'loadActivity' }] },
  triggers: [
    { event: 'ui:click', ref: 'close', do: [{ emit: { channel: 'deselect' } }, { pop: true }] },
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
            input: { saveFn: 'contact.update', modalTitle: 'Edit contact', confirmLabel: 'Save', id: '$.view.record.contact_id', name: '$.view.record.name', email: '$.view.record.email', phone: '$.view.record.phone', title: '$.view.record.title', company: '$.view.record.company.company_id' },
          },
        },
      ],
    },
    { message: 'contacts-changed', do: [{ call: 'load' }] },
    // Complete one of the contact's open tasks inline; re-read its list (and tell
    // the rest of the app) on success.
    { event: 'ui:click', ref: 'complete-task', do: [{ set: 'toggleId', value: '@event.payload' }, { set: 'toggleDone', value: true }, { call: 'setDone', onSuccess: [{ emit: { channel: 'tasks-changed' } }] }] },
    { message: 'tasks-changed', do: [{ call: 'loadTasks' }] },
    // A deal in the contact's list opens the deal workspace (the one deal view),
    // as a modal over this panel.
    { event: 'ui:click', ref: 'open-deal', do: [{ push: { action: 'deal', canvas: 'modal', input: { id: '@event.payload' } } }] },
    {
      event: 'ui:click',
      ref: 'open-company',
      do: [
        { replace: { action: 'companies', canvas: 'main', input: { highlight_id: '@event.payload' } } },
        { emit: { channel: 'screen-companies' } },
        { replace: { action: 'company', canvas: 'detail', input: { id: '@event.payload' } } },
      ],
    },
  ],
};
