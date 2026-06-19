import type { ActionDefinition } from '@niscorp/nova';
import { dealModalLayout } from './deal-modal.layout';

// The deal workspace — a focused modal over the board (not the squished side
// panel). On mount, `loadDealModal` fills `$.view` with the deal + its activity
// feed, line items, tasks and primary contact. The action row is where you WORK
// the deal: advance/edit/log/add-task/won/lost. Those are wired but stubbed —
// the writes land in the mutations phase, so for now they just close the menu /
// no-op (honest: nothing persists yet).
export const dealModalAction: ActionDefinition = {
  id: 'deal-modal',
  data: { id: '', view: { record: {}, activities: [], lineItems: [], tasks: [], contact: {} }, loading: true, toggleId: '', toggleDone: false },
  layout: dealModalLayout,
  // Each section is its own read into a slot of `$.view`; the layout binds the
  // slots. The primary contact keys off the deal's `primary_contact_id`, so it
  // runs after the record loads (onSuccess).
  endpoints: {
    loadRecord: { fn: 'deal.byId', target: 'view.record' },
    loadActivities: { fn: 'deal.activities', target: 'view.activities' },
    loadLineItems: { fn: 'deal.lineItems', target: 'view.lineItems' },
    loadTasks: { fn: 'deal.tasks', target: 'view.tasks' },
    loadContact: { fn: 'deal.contact', target: 'view.contact' },
    markWon: { fn: 'deal.markWon' },
    markLost: { fn: 'deal.markLost' },
    setDone: { fn: 'task.setDone' },
  },
  lifecycle: {
    mount: [
      { call: 'loadRecord', onSuccess: [{ set: 'loading', value: false }, { call: 'loadContact' }] },
      { call: 'loadActivities' },
      { call: 'loadLineItems' },
      { call: 'loadTasks' },
    ],
  },
  // ✕ closes. Won/Lost persist the status, refresh the record (the badge flips),
  // and announce `deals-changed` so the board + deals list drop the now-closed
  // deal from the open pipeline. (advance/log/add-task/edit wired below as they
  // land; remaining ones are no-ops until then.)
  triggers: [
    { event: 'ui:click', ref: 'close', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'won', do: [{ call: 'markWon', onSuccess: [{ call: 'loadRecord' }, { emit: { channel: 'deals-changed' } }] }] },
    { event: 'ui:click', ref: 'lost', do: [{ call: 'markLost', onSuccess: [{ call: 'loadRecord' }, { emit: { channel: 'deals-changed' } }] }] },
    // Add task opens the task form prefilled with this deal; on save it emits
    // `tasks-changed`, which re-reads the modal's task list below.
    { event: 'ui:click', ref: 'add-task', do: [{ push: { action: 'new-task', canvas: 'modal', with: ['modal'], input: { deal_id: '$.view.record.deal_id' } } }] },
    // Complete an open task inline (the marker is a button carrying its id).
    { event: 'ui:click', ref: 'complete-task', do: [{ set: 'toggleId', value: '@event.payload' }, { set: 'toggleDone', value: true }, { call: 'setDone', onSuccess: [{ emit: { channel: 'tasks-changed' } }] }] },
    { message: 'tasks-changed', do: [{ call: 'loadTasks' }] },
    // Edit opens the deal form seeded from the RAW record fields (value is the
    // number, close_date/stage/company/contact are the raw ids). `deals-changed`
    // (emitted by the save) re-reads this record.
    {
      event: 'ui:click',
      ref: 'edit',
      do: [
        {
          push: {
            action: 'edit-deal',
            canvas: 'modal',
            with: ['modal'],
            input: { id: '$.view.record.deal_id', title: '$.view.record.title', company: '$.view.record.company_id', stage: '$.view.record.stage_id', contact: '$.view.record.primary_contact_id', value: '$.view.record.value', close_date: '$.view.record.close_date' },
          },
        },
      ],
    },
    { message: 'deals-changed', do: [{ call: 'loadRecord' }] },
  ],
};
