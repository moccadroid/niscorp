import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { opsIntegrationsLayout } from './integrations.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { integrationsPrism, servicesPrism, offerOnPrism, offerOffPrism } from './ops.prism';

// The hotel's Integrations pane — where a property CHOOSES from what its
// connectors offer.
//
// Three layers meet here and only one is the manager's:
//
//   provided — the vendor switched it on in the connector (read-only here)
//   offered  — this property's own switch (the one write on this screen)
//   placed   — the resolved surface, recomputed by the resync that follows
//              every flip, which is why nothing here computes what is live
//
// A service the connector does not provide renders grey with the reason — the
// row exists so the manager can SEE what a connector could do; asking for it
// is a phone call to us, not a control.
export const opsIntegrationsAction: ActionDefinition = {
  id: 'ops.integrations',
  title: 'Integrations',
  data: { propertyId: '', integrations: [], selected: {}, services: [], stage: {}, working: false, loading: true, expanded: true },
  layout: previewable(crewCard('Integrations', 'plug', '{{$.integrations.length}} services running this hotel — switch what it offers'), opsIntegrationsLayout),
  endpoints: {
    loadIntegrations: { url: '/api/deploy/vex', method: 'POST', request: integrationsPrism, target: 'integrations' },
    loadServices: { url: '/api/deploy/vex', method: 'POST', request: servicesPrism, target: 'services' },
    offerOn: { url: '/api/deploy/vex', method: 'POST', request: offerOnPrism },
    offerOff: { url: '/api/deploy/vex', method: 'POST', request: offerOffPrism },
    // A property flipping a service is the small version of a vendor go-live:
    // write the switch, re-resolve, refresh — same seam, same honesty.
    resync: { fn: 'connector.resync' },
  },
  // loadServices also runs at mount: with no `selected` seeded it reads
  // against an empty connector id and returns nothing, harmlessly; seeded
  // (an opener or the agent aiming the screen), the section arrives open.
  lifecycle: { mount: [{ call: 'loadIntegrations', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadServices' }] },
  triggers: [
    { event: 'ui:click', ref: 'pick', do: [{ set: 'selected', value: '@event.payload' }, { call: 'loadServices' }] },
    {
      event: 'ui:click',
      ref: 'offer-on',
      do: [
        { set: 'stage', value: '@event.payload' },
        { set: 'working', value: true },
        { call: 'offerOn', onSuccess: [{ call: 'resync', onSuccess: [{ set: 'working', value: false }, { call: 'loadServices' }, { emit: { channel: 'capabilities-changed' } }] }], onError: [{ set: 'working', value: false }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'offer-off',
      do: [
        { set: 'stage', value: '@event.payload' },
        { set: 'working', value: true },
        { call: 'offerOff', onSuccess: [{ call: 'resync', onSuccess: [{ set: 'working', value: false }, { call: 'loadServices' }, { emit: { channel: 'capabilities-changed' } }] }], onError: [{ set: 'working', value: false }] },
      ],
    },
    { message: 'capabilities-changed', do: [{ call: 'loadServices' }] },
    ...previewTriggers,
  ],
};

export const opsIntegrationsInputSchema = z.toJSONSchema(
  z.object({
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    selected: z
      .object({ connector_id: z.string().optional(), name: z.string().optional() })
      .optional()
      .describe('Open with this connector’s services showing — connector_id and display name, e.g. from integrations/forProperty.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the composed crew surface); true (default) the full pane.'),
  }),
);
