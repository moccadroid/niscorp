import type { ActionDefinition } from '@niscorp/nova';
import { dealLayout } from './deal.layout';

// The deal — the single deal representation, canvas-agnostic in spirit (today it
// carries its own Overlay and is pushed onto the `modal` canvas). On mount each
// section is its own read into a slot of `$.view`. The action row is where you
// work the deal: edit / add-task / won / lost. The primary contact keys off the
// loaded record's `primary_contact_id`, so it runs after the record (onSuccess).
export const dealAction: ActionDefinition = {
  id: 'deal',
  // Stack-nav label — the chip + its depth menu read `instance.title`.
  title: '{{$.view.record.title}}',
  // `panelClass` is the card width used when this record is shown on the modal
  // canvas via the `panel` fragment; ignored on the main/aside canvases.
  data: { id: '', view: { record: {}, activities: [], lineItems: [], tasks: [], contact: {} }, loading: true, toggleId: '', toggleDone: false, panelClass: 'rl-dialog--wide' },
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
  layout: dealLayout,
  lifecycle: {
    mount: [
      { call: 'loadRecord', onSuccess: [{ set: 'loading', value: false }, { call: 'loadContact' }] },
      { call: 'loadActivities' },
      { call: 'loadLineItems' },
      { call: 'loadTasks' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'won', do: [{ call: 'markWon', onSuccess: [{ call: 'loadRecord' }, { emit: { channel: 'deals-changed' } }] }] },
    { event: 'ui:click', ref: 'lost', do: [{ call: 'markLost', onSuccess: [{ call: 'loadRecord' }, { emit: { channel: 'deals-changed' } }] }] },
    // Add task opens the task form prefilled with this deal; on save it emits
    // `tasks-changed`, which re-reads the task list below.
    { event: 'ui:click', ref: 'add-task', do: [{ push: { action: 'task.form', canvas: 'modal', with: ['modal'], input: { deal_id: '$.view.record.deal_id' } } }] },
    // Complete an open task inline (the marker is a button carrying its id).
    { event: 'ui:click', ref: 'complete-task', do: [{ set: 'toggleId', value: '@event.payload' }, { set: 'toggleDone', value: true }, { call: 'setDone', onSuccess: [{ emit: { channel: 'tasks-changed' } }] }] },
    { message: 'tasks-changed', do: [{ call: 'loadTasks' }] },
    // Edit opens the deal form seeded from the RAW record fields (value is the
    // number; close_date/stage/company/contact are the raw ids). The seeded `id`
    // makes the `upsert` write an update; `deals-changed` (the save announces it)
    // re-reads this record.
    {
      event: 'ui:click',
      ref: 'edit',
      do: [
        {
          push: {
            action: 'deal.form',
            canvas: 'modal',
            with: ['modal'],
            input: { modalTitle: 'Edit deal', confirmLabel: 'Save', id: '$.view.record.deal_id', title: '$.view.record.title', company: '$.view.record.company_id', stage: '$.view.record.stage_id', contact: '$.view.record.primary_contact_id', value: '$.view.record.value', close_date: '$.view.record.close_date' },
          },
        },
      ],
    },
    { message: 'deals-changed', do: [{ call: 'loadRecord' }] },
  ],
};
