import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { opsIssuesLayout } from './issues.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { byKindPrism, byRoomPrism } from './ops.prism';

// "What keeps breaking, and where." Two grouped counts, both plain reads. This
// is the shape of the analytics this app permits: a question the query grammar
// answers, not a computation a model performs.
export const opsIssuesAction: ActionDefinition = {
  id: 'ops.issues',
  title: 'By type',
  data: { propertyId: '', byKind: [], byRoom: [], loading: true, expanded: true },
  layout: previewable(
    crewCard('Issues by type', 'flag', { $if: '$.byKind.length', $then: 'Most common: {{$.byKind.0.kind}} ({{$.byKind.0.count}})', $else: 'Nothing raised yet.' }),
    opsIssuesLayout,
  ),
  endpoints: {
    loadKind: { url: '/api/service/vex', method: 'POST', request: byKindPrism, target: 'byKind' },
    loadRoom: { url: '/api/service/vex', method: 'POST', request: byRoomPrism, target: 'byRoom' },
  },
  lifecycle: { mount: [{ call: 'loadKind', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadRoom' }] },
  triggers: [{ message: 'issues-changed', do: [{ call: 'loadKind' }, { call: 'loadRoom' }] }, ...previewTriggers],
};

export const opsIssuesInputSchema = z.toJSONSchema(
  z.object({
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the composed crew surface); true (default) the full breakdown.'),
  }),
);
