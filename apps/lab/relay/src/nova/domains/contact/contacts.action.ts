import type { ActionDefinition } from '@niscorp/nova';
import { contactsLayout } from './contacts.layout';

// A literal action. On mount it calls the `contacts.list` data prism, which
// builds the Vex request from `$.q`/`$.sortBy` and runs it into `$.rows`.
export const contactsAction: ActionDefinition = {
  id: 'contacts',
  // `highlight_id` marks the row open in the detail panel — set on row click,
  // passed in on navigation with a record open, cleared by `deselect` on close.
  // `pendingDeleteId`/`pendingDeleteLabel` hold the row the ⋯ → Delete confirm is
  // about (set when Delete is clicked, consumed when the dialog confirms).
  data: { q: '', rows: [], loading: true, highlight_id: '', menuOpenId: '', sortBy: 'contacts.last_name', sortDir: 'asc', pendingDeleteId: '', pendingDeleteLabel: '' },
  layout: contactsLayout,
  endpoints: { load: { fn: 'contacts.list', target: 'rows' }, remove: { fn: 'contact.delete' } },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  // A row click highlights it + opens the contact in the detail canvas (by id).
  // `new` (emitted by the topbar's "+ New") opens the new-contact form on the
  // `modal` canvas, composed `with: ['modal']` so the fragment wraps it. The row
  // ⋯ menu ITEMS carry the whole row (the Table passes it), so Edit/Delete read
  // their fields straight off `@event.payload`.
  triggers: [
    // Toolbar (Tier 1B): search + sortable headers re-run the list through `browse`.
    { event: 'ui:model', ref: 'q', do: [{ set: 'q', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'sort', do: [{ set: 'sortBy', value: '@event.payload.sortBy' }, { set: 'sortDir', value: '@event.payload.sortDir' }, { call: 'load' }] },
    // The row body (not the menu) still carries just the id.
    { event: 'ui:click', ref: 'row', do: [{ set: 'highlight_id', value: '@event.payload' }, { replace: { action: 'contact', canvas: 'detail', input: { id: '@event.payload' } } }] },
    { message: 'deselect', do: [{ set: 'highlight_id', value: '' }] },
    { message: 'new', do: [{ push: { action: 'contact.form', canvas: 'modal', with: ['modal'] } }] },
    // A create/edit/delete elsewhere announces itself; re-read so the list reflects it.
    { message: 'contacts-changed', do: [{ call: 'load' }] },
    // Row `⋯` menu. Open opens the detail; Edit opens the form seeded from the row
    // (the list carries phone too, so nothing is lost); Delete stashes the row and
    // opens the confirm dialog.
    { event: 'ui:click', ref: 'menu-open', do: [{ set: 'menuOpenId', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'menu-close', do: [{ set: 'menuOpenId', value: '' }] },
    { event: 'ui:click', ref: 'row-open', do: [{ set: 'highlight_id', value: '@event.payload.contact_id' }, { replace: { action: 'contact', canvas: 'detail', input: { id: '@event.payload.contact_id' } } }, { set: 'menuOpenId', value: '' }] },
    {
      event: 'ui:click',
      ref: 'row-edit',
      do: [
        { set: 'menuOpenId', value: '' },
        { push: { action: 'contact.form', canvas: 'modal', with: ['modal'], input: { saveFn: 'contact.update', modalTitle: 'Edit contact', confirmLabel: 'Save', id: '@event.payload.contact_id', name: '@event.payload.name', email: '@event.payload.email', phone: '@event.payload.phone', title: '@event.payload.title', company: '@event.payload.company.company_id' } } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'row-delete',
      do: [
        { set: 'menuOpenId', value: '' },
        { set: 'pendingDeleteId', value: '@event.payload.contact_id' },
        { set: 'pendingDeleteLabel', value: '@event.payload.name' },
        { push: { action: 'confirm-delete', canvas: 'modal', input: { label: '@event.payload.name', message: 'This permanently deletes the contact. This can’t be undone.' } } },
      ],
    },
    // The confirm dialog said yes → delete by the stashed id, then re-read the
    // list, clear the selection, and close the detail panel if it was showing it.
    { message: 'confirm-delete', do: [{ call: 'remove', onSuccess: [{ emit: { channel: 'contacts-changed' } }, { emit: { channel: 'deselect' } }, { emit: { channel: 'detail-close' } }, { set: 'pendingDeleteId', value: '' }] }] },
  ],
};
