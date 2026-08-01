import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { issueTileLayout, issueListLayout, issueDetailLayout } from './issue.layouts';
import { boardPrism, issueByIdPrism, issueTasksByIdPrism, resolveByIdPrism, dispatchByIdPrism, staffPrism } from './desk.prism';

// ═══════════════════════════════════════════════════════════
// THE ISSUE FAMILY — what `desk.board` used to be, in four parts.
//
// The monolith held the queue, the open issue, the dispatch controls and the
// resolve button in one action, with the open issue in its own `data` written
// only by a row click. Three consequences, and the third is why this exists:
//
//   the layout branched at its root twice over (collapsed/expanded, then
//   open/not-open), which is where sprawl comes from;
//   nothing could be reasoned about — "the board" is not a thing you can hand
//   to somebody;
//   and NOTHING BUT A FINGER could open an issue. Not a push, not a link, not
//   the agent. `openIssue` was not in the input contract, so the seed filter
//   dropped it. The assistant could offer the board and never an issue.
//
// Split along the seam the layout already had: `id` = `desk.issue.<type>`, and
// the type is the last segment so the app can derive from it. Each part takes
// its subject as INPUT, which is the whole point.
// ═══════════════════════════════════════════════════════════

// ── tile: one live figure ────────────────────────────────────
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
    // A tile opens the list. It carries nothing of its own — the list reads the
    // property from its own input.
    { event: 'ui:click', ref: 'open', do: [{ push: { action: 'desk.issue.list', canvas: 'work', input: { propertyId: '$.propertyId' } } }] },
    { message: 'issues-changed', do: [{ call: 'load' }] },
  ],
};

export const issueTileInputSchema = z.toJSONSchema(
  z.object({ propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.') }),
);

// ── list: the queue, and nothing else ───────────────────────
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
    // A row opens the issue in the RECORD column, beside this queue — the queue
    // stays visible and keeps its scroll, its tab and its search. `resetTo`
    // rather than `push`: picking a second row replaces the record instead of
    // burying the first one behind it.
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

// ── detail: ONE issue, addressable ──────────────────────────
// Sending it to somebody is the next step on any open fault, so the controls are
// simply on the record. The assistant aims them by setting `kind` and
// `assigneeId`; there is no separate state to ask for first.
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
  // The floor is read on mount: the controls are on the record from the moment
  // it opens, so the people to choose from have to be there with them.
  lifecycle: {
    mount: [
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'loadTasks' },
      { call: 'loadStaff' },
    ],
  },
  triggers: [
    // CLOSE, not back. Every route onto `detail` is a `resetTo`, so the column
    // holds exactly one card and popping it empties the column. The list it came
    // from is still on `work`, which is where "back" would have gone.
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
            // The issue is still here, so the dispatched task lands in its own
            // list rather than the clerk being sent back to look at it.
            { call: 'loadTasks' },
          ],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    // Resolving is done with this issue: close the surface and let the queue
    // underneath re-read itself.
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
