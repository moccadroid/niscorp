import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { opsIntegrationsLayout } from './integrations.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { integrationsPrism, servicesPrism, offerOnPrism, offerOffPrism } from './ops.prism';

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
    resync: { fn: 'connector.resync' },
  },
  // loadServices runs at mount for an opener that seeds `selected`; unseeded
  // it reads an empty connector id and returns nothing.
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
