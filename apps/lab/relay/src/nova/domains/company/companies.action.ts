import type { ActionDefinition } from '@niscorp/nova';
import { companiesLayout } from './companies.layout';

export const companiesAction: ActionDefinition = {
  id: 'companies',
  // `highlight_id` marks the row whose company is open in the detail panel. It's
  // set on a row click, passed in when navigated to with a record open (a
  // cross-link or a deep URL), and cleared by `deselect` when the panel closes.
  // `pendingDeleteId`/`pendingDeleteLabel` hold the row the ⋯ → Delete confirm is
  // about (set when Delete is clicked, consumed when the dialog confirms).
  data: { q: '', rows: [], loading: true, highlight_id: '', menuOpenId: '', sortBy: 'companies.name', sortDir: 'asc', pendingDeleteId: '', pendingDeleteLabel: '' },
  layout: companiesLayout,
  endpoints: { load: { fn: 'companies.list', target: 'rows' }, remove: { fn: 'company.delete' } },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  // A row click highlights it + opens the company in the shared detail panel.
  // `new` (from the topbar's + New) opens the new-company modal. The row ⋯ menu
  // ITEMS carry the whole row, so Edit/Delete read their fields off the payload.
  triggers: [
    // Toolbar (Tier 1B): search + sortable headers re-run the list through `browse`.
    { event: 'ui:model', ref: 'q', do: [{ set: 'q', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'sort', do: [{ set: 'sortBy', value: '@event.payload.sortBy' }, { set: 'sortDir', value: '@event.payload.sortDir' }, { call: 'load' }] },
    // The row body (not the menu) still carries just the id.
    { event: 'ui:click', ref: 'row', do: [{ set: 'highlight_id', value: '@event.payload' }, { replace: { action: 'company', canvas: 'detail', input: { id: '@event.payload' } } }] },
    { message: 'deselect', do: [{ set: 'highlight_id', value: '' }] },
    { message: 'new', do: [{ push: { action: 'company.form', canvas: 'modal', with: ['modal'] } }] },
    // A create/edit/delete elsewhere announces itself; re-read so the list reflects it.
    { message: 'companies-changed', do: [{ call: 'load' }] },
    // Row `⋯` menu. Open opens the detail; Edit opens the form seeded from the row
    // (the list carries every editable field); Delete stashes the row and opens
    // the confirm dialog (which warns this cascades to the company's records).
    { event: 'ui:click', ref: 'menu-open', do: [{ set: 'menuOpenId', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'menu-close', do: [{ set: 'menuOpenId', value: '' }] },
    { event: 'ui:click', ref: 'row-open', do: [{ set: 'highlight_id', value: '@event.payload.company_id' }, { replace: { action: 'company', canvas: 'detail', input: { id: '@event.payload.company_id' } } }, { set: 'menuOpenId', value: '' }] },
    {
      event: 'ui:click',
      ref: 'row-edit',
      do: [
        { set: 'menuOpenId', value: '' },
        { push: { action: 'company.form', canvas: 'modal', with: ['modal'], input: { saveFn: 'company.update', modalTitle: 'Edit company', confirmLabel: 'Save', id: '@event.payload.company_id', name: '@event.payload.name', domain: '@event.payload.domain', industry: '@event.payload.industry', size: '@event.payload.size' } } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'row-delete',
      do: [
        { set: 'menuOpenId', value: '' },
        { set: 'pendingDeleteId', value: '@event.payload.company_id' },
        { set: 'pendingDeleteLabel', value: '@event.payload.name' },
        { push: { action: 'confirm-delete', canvas: 'modal', input: { label: '@event.payload.name', message: 'This also deletes the company’s contacts and deals. This can’t be undone.' } } },
      ],
    },
    { message: 'confirm-delete', do: [{ call: 'remove', onSuccess: [{ emit: { channel: 'companies-changed' } }, { emit: { channel: 'deselect' } }, { emit: { channel: 'detail-close' } }, { set: 'pendingDeleteId', value: '' }] }] },
  ],
};
