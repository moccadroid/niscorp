import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { dealsLayout } from './deals.layout';
import { listDealsPrism, moveDealPrism, deleteDealPrism } from './deals.prism';
import { dealsBoard, dealsOpenByStage, dealsForecast } from '@relay/app/vex/deals.entries';

export const dealsAction: ActionDefinition = {
  id: 'crm.deals',
  title: 'Deals',
  data: {
    view: 'table',
    search: '', ownerId: '', rows: [], loading: true, highlight_id: '', menuOpenId: '',
    sortBy: 'deals.created_at', sortDir: 'desc', pendingDeleteId: '', pendingDeleteLabel: '',
    stages: [], deals: [], summary: {}, boardLoading: true, moveId: '', moveStage: '',
  },
  layout: dealsLayout,
  endpoints: {
    load:        { url: '/api/deals/vex', method: 'POST', request: listDealsPrism, target: 'rows' },
    remove:      { url: '/api/deals/vex',           method: 'POST', request: deleteDealPrism },
    loadStages:  { url: '/api/deals/vex', method: 'POST', request: { fingerprint: dealsOpenByStage.fingerprint, context: {} }, target: 'stages' },
    loadDeals:   { url: '/api/deals/vex', method: 'POST', request: { fingerprint: dealsBoard.fingerprint, context: {} }, target: 'deals' },
    loadSummary: { url: '/api/deals/vex', method: 'POST', request: { fingerprint: dealsForecast.fingerprint, context: {} }, target: 'summary' },
    move:        { url: '/api/deals/vex',           method: 'POST', request: moveDealPrism },
  },
  lifecycle: {
    mount: [
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'loadStages', onSuccess: [{ set: 'boardLoading', value: false }] },
      { call: 'loadDeals' },
      { call: 'loadSummary' },
    ],
    resume: [{ set: 'highlight_id', value: '' }],
  },
  triggers: [
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'sort', do: [{ set: 'sortBy', value: '@event.payload.sortBy' }, { set: 'sortDir', value: '@event.payload.sortDir' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'tab', do: [{ set: 'ownerId', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'row', do: [{ set: 'highlight_id', value: '@event.payload' }, { push: { action: 'crm.deal.view', input: { id: '@event.payload' } } }] },
    { message: 'deselect', do: [{ set: 'highlight_id', value: '' }] },
    { event: 'ui:click', ref: 'menu-open', do: [{ set: 'menuOpenId', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'menu-close', do: [{ set: 'menuOpenId', value: '' }] },
    { event: 'ui:click', ref: 'row-open', do: [{ set: 'highlight_id', value: '@event.payload.deal_id' }, { push: { action: 'crm.deal.view', input: { id: '@event.payload.deal_id' } } }, { set: 'menuOpenId', value: '' }] },
    {
      event: 'ui:click',
      ref: 'row-edit',
      do: [
        { set: 'menuOpenId', value: '' },
        { push: { action: 'crm.deal.form', canvas: 'modal', with: ['modal'], input: { modalTitle: 'Edit deal', confirmLabel: 'Save', id: '@event.payload.deal_id', title: '@event.payload.title', company: '@event.payload.company_id', stage: '@event.payload.stage_id', contact: '@event.payload.primary_contact_id', value: '@event.payload.value', close_date: '@event.payload.close_date' } } },
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
    { event: 'ui:click', ref: 'card', do: [{ push: { action: 'crm.deal.view', input: { id: '@event.payload' } } }] },
    {
      event: 'ui:drop',
      ref: 'move-deal',
      do: [
        { set: 'moveId', value: '@event.payload.id' },
        { set: 'moveStage', value: '@event.payload.toStage' },
        { call: 'move', onSuccess: [{ call: 'loadStages' }, { call: 'loadDeals' }, { call: 'loadSummary' }] },
      ],
    },
    { message: 'new', do: [{ push: { action: 'crm.deal.form', canvas: 'modal', with: ['modal'] } }] },
    { message: 'deals-changed', do: [{ call: 'load' }, { call: 'loadStages' }, { call: 'loadDeals' }, { call: 'loadSummary' }] },
  ],
};

export const dealsInputSchema = z.toJSONSchema(
  z.object({
    view: z.enum(['table', 'board']).optional().describe("'board' for the pipeline Kanban, else the table"),
    ownerId: z.enum(['', 'me']).optional().describe("'me' to show only the current user's deals"),
    sortBy: z.string().optional().describe("e.g. 'deals.value', 'deals.created_at'"),
    sortDir: z.enum(['asc', 'desc']).optional(),
    search: z.string().optional().describe('search text'),
    highlight_id: z.string().optional().describe('a deal id to highlight'),
  }),
);
