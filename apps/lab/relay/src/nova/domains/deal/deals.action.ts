import type { ActionDefinition } from '@niscorp/nova';
import { dealsLayout } from './deals.layout';

// The deals collection — ONE action, two layouts (`$.view`: 'table' | 'board').
// Navigation sets the initial view (sidebar Deals → table, Pipeline → board; the
// /deals vs /pipeline URLs likewise). Because Nova has no conditional lifecycle,
// mount loads BOTH views' data — all cached/prewarmed Vex reads — and the
// inactive layout simply isn't rendered. The table view's reads/triggers and the
// board view's reads/triggers coexist here; `deals-changed` refreshes both.
export const dealsAction: ActionDefinition = {
  id: 'deals',
  title: 'Deals',
  data: {
    view: 'table',
    // ── table view ──
    // `highlight_id` marks the row open in the detail panel; `menuOpenId` is the
    // row whose `⋯` menu is open. `sortBy`/`sortDir` are Vex's reserved sort keys
    // (created_at desc by default). `ownerId` scopes the list: '' = All, 'me' =
    // the current user, an id = an owner cross-link.
    search: '', ownerId: '', rows: [], loading: true, highlight_id: '', menuOpenId: '',
    sortBy: 'deals.created_at', sortDir: 'desc', pendingDeleteId: '', pendingDeleteLabel: '',
    // ── board view ──
    board: { stages: [], deals: [], summary: {} }, boardLoading: true, moveId: '', moveStage: '',
  },
  layout: dealsLayout,
  endpoints: {
    load: { fn: 'deals.list', target: 'rows' },
    remove: { fn: 'deal.delete' },
    loadStages: { fn: 'board.stages', target: 'board.stages' },
    loadDeals: { fn: 'board.deals', target: 'board.deals' },
    loadSummary: { fn: 'board.summary', target: 'board.summary' },
    move: { fn: 'deal.moveStage' },
  },
  lifecycle: {
    mount: [
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'loadStages', onSuccess: [{ set: 'boardLoading', value: false }] },
      { call: 'loadDeals' },
      { call: 'loadSummary' },
    ],
    // On resume (a drilled deal popped back to the list) clear the row highlight —
    // the chip's Back pops the record directly, so there's no `deselect` to do it.
    resume: [{ set: 'highlight_id', value: '' }],
  },
  triggers: [
    // ── table view ──
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'sort', do: [{ set: 'sortBy', value: '@event.payload.sortBy' }, { set: 'sortDir', value: '@event.payload.sortDir' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'tab', do: [{ set: 'ownerId', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'row', do: [{ set: 'highlight_id', value: '@event.payload' }, { push: { action: 'deal', input: { id: '@event.payload' } } }] },
    { message: 'deselect', do: [{ set: 'highlight_id', value: '' }] },
    { event: 'ui:click', ref: 'menu-open', do: [{ set: 'menuOpenId', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'menu-close', do: [{ set: 'menuOpenId', value: '' }] },
    { event: 'ui:click', ref: 'row-open', do: [{ set: 'highlight_id', value: '@event.payload.deal_id' }, { push: { action: 'deal', input: { id: '@event.payload.deal_id' } } }, { set: 'menuOpenId', value: '' }] },
    // Edit opens the deal form seeded from the row: the seeded `id` makes the
    // `upsert` write an update, the rest seeds the record's fields.
    {
      event: 'ui:click',
      ref: 'row-edit',
      do: [
        { set: 'menuOpenId', value: '' },
        { push: { action: 'deal.form', canvas: 'modal', with: ['modal'], input: { modalTitle: 'Edit deal', confirmLabel: 'Save', id: '@event.payload.deal_id', title: '@event.payload.title', company: '@event.payload.company_id', stage: '@event.payload.stage_id', contact: '@event.payload.primary_contact_id', value: '@event.payload.value', close_date: '@event.payload.close_date' } } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'row-delete',
      do: [
        { set: 'menuOpenId', value: '' },
        { set: 'pendingDeleteId', value: '@event.payload.deal_id' },
        { set: 'pendingDeleteLabel', value: '@event.payload.title' },
        { push: { action: 'confirm-delete', canvas: 'modal', with: ['panel'], input: { label: '@event.payload.title', message: 'This permanently deletes the deal and its line items. This can’t be undone.' } } },
      ],
    },
    { message: 'confirm-delete', do: [{ call: 'remove', onSuccess: [{ emit: { channel: 'deals-changed' } }, { set: 'pendingDeleteId', value: '' }] }] },
    // ── board view ──
    { event: 'ui:click', ref: 'card', do: [{ push: { action: 'deal', input: { id: '@event.payload' } } }] },
    {
      event: 'ui:drop',
      ref: 'move-deal',
      do: [
        { set: 'moveId', value: '@event.payload.id' },
        { set: 'moveStage', value: '@event.payload.toStage' },
        { call: 'move', onSuccess: [{ call: 'loadStages' }, { call: 'loadDeals' }, { call: 'loadSummary' }] },
      ],
    },
    // ── shared ──
    // The topbar's + New (and the Pipeline view) open the deal form bare — no
    // `id`, so the `upsert` write inserts.
    { message: 'new', do: [{ push: { action: 'deal.form', canvas: 'modal', with: ['modal'] } }] },
    // A deal changed elsewhere → refresh BOTH views' data.
    { message: 'deals-changed', do: [{ call: 'load' }, { call: 'loadStages' }, { call: 'loadDeals' }, { call: 'loadSummary' }] },
  ],
};
