import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { issueTileLayout, issueListLayout, issueDetailLayout } from './issue.layouts';
import { boardPrism, issueByIdPrism, issueTasksByIdPrism, resolveByIdPrism, dispatchByIdPrism, staffPrism } from './desk.prism';

export const issueTileAction: ActionDefinition = {
  id: 'desk.issue.tile',
  title: 'Issues',
  data: { propertyId: '', count: {} },
  layout: issueTileLayout,
  endpoints: {
    load: { url: '/api/service/vex', method: 'POST', request: { fingerprint: 'issues/openCount', context: { propertyId: { $ref: '$.propertyId' } } }, target: 'count' },
  },
  lifecycle: { mount: [{ call: 'load' }] },
  triggers: [
    { event: 'ui:click', ref: 'open', do: [{ push: { action: 'desk.issue.list', canvas: 'work', input: { propertyId: '$.propertyId' } } }] },
    { message: 'issues-changed', do: [{ call: 'load' }] },
  ],
};

export const issueTileInputSchema = z.toJSONSchema(
  z.object({ propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.') }),
);

export const issueListAction: ActionDefinition = {
  id: 'desk.issue.list',
  title: 'Issue board',
  data: { propertyId: '', search: '', scope: 'open', rows: [], loading: true },
  layout: issueListLayout,
  endpoints: {
    load: { url: '/api/service/vex', method: 'POST', request: boardPrism, target: 'rows' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'tab', do: [{ set: 'scope', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'row', do: [{ resetTo: { action: 'desk.issue.detail', canvas: 'detail', input: { issueId: '@event.payload.issue_id', propertyId: '$.propertyId' }, with: ['detail'] } }] },
    { message: 'issues-changed', do: [{ call: 'load' }] },
  ],
};

export const issueListInputSchema = z.toJSONSchema(
  z.object({
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    scope: z.enum(['open', 'resolved', 'all']).optional().describe('Which slice of the board to open on.'),
    search: z.string().optional().describe('Open the queue already filtered to this text.'),
  }),
);

export const issueDetailAction: ActionDefinition = {
  id: 'desk.issue.detail',
  title: 'The issue',
  data: { issueId: '', propertyId: '', issue: {}, tasks: [], staff: [], kind: 'maintenance', assigneeId: '', working: false, loading: true },
  layout: issueDetailLayout,
  endpoints: {
    load: { url: '/api/service/vex', method: 'POST', request: issueByIdPrism, target: 'issue' },
    loadTasks: { url: '/api/service/vex', method: 'POST', request: issueTasksByIdPrism, target: 'tasks' },
    loadStaff: { url: '/api/service/vex', method: 'POST', request: staffPrism, target: 'staff' },
    resolve: { url: '/api/service/vex', method: 'POST', request: resolveByIdPrism },
    dispatch: { url: '/api/service/vex', method: 'POST', request: dispatchByIdPrism },
  },
  lifecycle: {
    mount: [
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'loadTasks' },
      { call: 'loadStaff' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'close', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'kind', do: [{ set: 'kind', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'assignee', do: [{ set: 'assigneeId', value: '@event.payload' }] },
    {
      event: 'ui:click',
      ref: 'send',
      do: [
        { set: 'working', value: true },
        {
          call: 'dispatch',
          onSuccess: [
            { set: 'working', value: false },
            { emit: { channel: 'tasks-changed' } },
            { call: 'loadTasks' },
          ],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    { event: 'ui:click', ref: 'resolve', do: [{ call: 'resolve', onSuccess: [{ emit: { channel: 'issues-changed' } }, { pop: true }] }] },
    { message: 'tasks-changed', do: [{ call: 'loadTasks' }] },
  ],
};

export const issueDetailInputSchema = z.toJSONSchema(
  z.object({
    issueId: z.string().describe('The issue to open. This is what makes an issue reachable by a push, a link or the assistant.'),
    propertyId: z.string().optional().describe('Seeded by the opener from the session; reading who is on the floor needs it.'),
    kind: z.enum(['maintenance', 'housekeeping']).optional().describe('Which trade to send it to. Set it and the user only presses Dispatch.'),
    assigneeId: z.string().optional().describe('Who to send it to; defaults to whoever is first on the floor.'),
  }),
);
