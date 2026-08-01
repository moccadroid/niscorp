import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { rolloutLayout } from './rollout.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { propertiesPrism, guestMatrixPrism } from './deploy.prism';

// Rollout: every property, the connector behind it, and — for whichever one is
// selected — exactly what a guest there holds right now.
//
// Two hotels side by side on one deployment is the second shot of the demo. The
// list this renders is the same `surface/guestMatrix` read for both; only the
// property id differs, and the answers are genuinely different because the
// integrations are.
export const deployRolloutAction: ActionDefinition = {
  id: 'deploy.rollout',
  title: 'Rollout',
  data: { rows: [], property: {}, guestMatrix: [], loading: true, expanded: true },
  layout: previewable(crewCard('Rollout', 'arrow', '{{$.rows.length}} properties — what a guest holds at each, right now'), rolloutLayout),
  endpoints: {
    load: { url: '/api/deploy/vex', method: 'POST', request: propertiesPrism, target: 'rows' },
    loadMatrix: { url: '/api/surface/vex', method: 'POST', request: guestMatrixPrism, target: 'guestMatrix' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'property', value: '@event.payload' }, { call: 'loadMatrix' }] },
    { message: 'capabilities-changed', do: [{ call: 'load' }, { call: 'loadMatrix' }] },
    ...previewTriggers,
  ],
};

export const deployRolloutInputSchema = z.toJSONSchema(
  z.object({
    expanded: z.boolean().optional().describe('false renders the one-line card (the composed console); true (default) the full estate view.'),
  }),
);
