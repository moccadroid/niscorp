import type { ActionDefinition } from '@niscorp/nova';
import { dealsLayout } from './deals.layout';

// The deals screen. The list loads through `browse` (Tier 1B): the toolbar's
// search box (`$.q`) and All/Mine tabs (which swap `$.queryId` between
// `deals.list` and `deals.byOwner`) both just re-run `load`. The deal-owner
// cross-link still works — it arrives with `queryId: deals.byOwner` + a
// `context: { ownerId }`, which browse merges in.
export const dealsAction: ActionDefinition = {
  id: 'deals',
  // `highlight_id` marks the row open in the detail panel — set on row click,
  // passed in on navigation with a record open, cleared by `deselect` on close.
  // `menuOpenId` is the row whose `⋯` menu is open ('' = none). `sortBy`/`sortDir`
  // are Vex's reserved sort keys (the prism forwards them) — initialised to the
  // query's own default (created_at desc) so the newest deal lands on top and the
  // Created header shows ▼ on load. `ownerId` scopes the list: '' = all (All tab),
  // 'me' = the current user (My-deals tab), an id = an owner cross-link.
  data: { q: '', ownerId: '', rows: [], loading: true, highlight_id: '', menuOpenId: '', sortBy: 'deals.created_at', sortDir: 'desc', pendingDeleteId: '', pendingDeleteLabel: '' },
  layout: dealsLayout,
  endpoints: { load: { fn: 'deals.list', target: 'rows' }, remove: { fn: 'deal.delete' } },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    // Toolbar: each keystroke / tab / column-header re-runs the query (no skeleton
    // flash — the rows just swap, like the action search).
    { event: 'ui:model', ref: 'q', do: [{ set: 'q', value: '@event.payload' }, { call: 'load' }] },
    // Column header → set the sort (the SortHeader hands the next sortBy+sortDir).
    { event: 'ui:click', ref: 'sort', do: [{ set: 'sortBy', value: '@event.payload.sortBy' }, { set: 'sortDir', value: '@event.payload.sortDir' }, { call: 'load' }] },
    // The tab sets `ownerId` ('' = All, 'me' = My deals); the prism resolves
    // 'me' to the current user and picks the owner-scoped shape.
    { event: 'ui:click', ref: 'tab', do: [{ set: 'ownerId', value: '@event.payload' }, { call: 'load' }] },
    // A row click highlights it + opens the deal in the detail panel (by id).
    // `new` (from the topbar's + New) opens the new-deal modal.
    { event: 'ui:click', ref: 'row', do: [{ set: 'highlight_id', value: '@event.payload' }, { push: { action: 'deal-modal', canvas: 'modal', input: { id: '@event.payload' } } }] },
    { message: 'deselect', do: [{ set: 'highlight_id', value: '' }] },
    { message: 'new', do: [{ push: { action: 'new-deal', canvas: 'modal', with: ['modal'] } }] },
    // A deal changed elsewhere (create, won/lost, stage move, delete) → re-read.
    { message: 'deals-changed', do: [{ call: 'load' }] },
    // Row `⋯` menu. Open/close track `menuOpenId` (the kebab carries the id);
    // the menu ITEMS carry the whole row. Open opens the deal workspace; Edit
    // opens the deal form seeded from the row (the list carries stage_id +
    // primary_contact_id + the numeric value); Delete confirms first.
    { event: 'ui:click', ref: 'menu-open', do: [{ set: 'menuOpenId', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'menu-close', do: [{ set: 'menuOpenId', value: '' }] },
    { event: 'ui:click', ref: 'row-open', do: [{ set: 'highlight_id', value: '@event.payload.deal_id' }, { push: { action: 'deal-modal', canvas: 'modal', input: { id: '@event.payload.deal_id' } } }, { set: 'menuOpenId', value: '' }] },
    {
      event: 'ui:click',
      ref: 'row-edit',
      do: [
        { set: 'menuOpenId', value: '' },
        { push: { action: 'edit-deal', canvas: 'modal', with: ['modal'], input: { id: '@event.payload.deal_id', title: '@event.payload.title', company: '@event.payload.company_id', stage: '@event.payload.stage_id', contact: '@event.payload.primary_contact_id', value: '@event.payload.value', close_date: '@event.payload.close_date' } } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'row-delete',
      do: [
        { set: 'menuOpenId', value: '' },
        { set: 'pendingDeleteId', value: '@event.payload.deal_id' },
        { set: 'pendingDeleteLabel', value: '@event.payload.title' },
        { push: { action: 'confirm-delete', canvas: 'modal', input: { label: '@event.payload.title', message: 'This permanently deletes the deal and its line items. This can’t be undone.' } } },
      ],
    },
    { message: 'confirm-delete', do: [{ call: 'remove', onSuccess: [{ emit: { channel: 'deals-changed' } }, { set: 'pendingDeleteId', value: '' }] }] },
  ],
};
