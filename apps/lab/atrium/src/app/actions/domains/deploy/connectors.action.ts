import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { connectorsLayout } from './connectors.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { connectorsPrism, offerPrism, reachPrism, stageOnPrism, stageOffPrism } from './deploy.prism';

export const deployConnectorsAction: ActionDefinition = {
  id: 'deploy.connectors',
  title: 'Connectors',
  data: {
    rows: [],
    selected: {},
    offer: [],
    reach: [],
    stage: {},
    dirty: false,
    shipped: false,
    working: false,
    loading: true,
    sync: [],
    expanded: true,
  },
  layout: previewable(crewCard('Connectors', 'plug', '{{$.rows.length}} integrations — what each offers, and the switches that ship it'), connectorsLayout),
  endpoints: {
    load: { url: '/api/deploy/vex', method: 'POST', request: connectorsPrism, target: 'rows' },
    loadOffer: { url: '/api/deploy/vex', method: 'POST', request: offerPrism, target: 'offer' },
    loadReach: { url: '/api/deploy/vex', method: 'POST', request: reachPrism, target: 'reach' },
    stageOn: { url: '/api/deploy/vex', method: 'POST', request: stageOnPrism },
    stageOff: { url: '/api/deploy/vex', method: 'POST', request: stageOffPrism },
    resync: { fn: 'connector.resync', target: 'sync' },
  },
  // loadOffer and loadReach run at mount for an opener that seeds `selected`;
  // unseeded they read an empty connector id and return nothing.
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadOffer' }, { call: 'loadReach' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'pick',
      do: [{ set: 'selected', value: '@event.payload' }, { set: 'shipped', value: false }, { set: 'dirty', value: false }, { call: 'loadOffer' }, { call: 'loadReach' }],
    },
    {
      event: 'ui:click',
      ref: 'stage-on',
      do: [{ set: 'stage', value: '@event.payload' }, { call: 'stageOn', onSuccess: [{ set: 'dirty', value: true }, { set: 'shipped', value: false }, { call: 'loadOffer' }] }],
    },
    {
      event: 'ui:click',
      ref: 'stage-off',
      do: [{ set: 'stage', value: '@event.payload' }, { call: 'stageOff', onSuccess: [{ set: 'dirty', value: true }, { set: 'shipped', value: false }, { call: 'loadOffer' }] }],
    },
    {
      event: 'ui:click',
      ref: 'golive',
      do: [
        { set: 'working', value: true },
        {
          call: 'resync',
          onSuccess: [{ set: 'working', value: false }, { set: 'dirty', value: false }, { set: 'shipped', value: true }, { call: 'load' }, { call: 'loadOffer' }],
          onError: [{ set: 'working', value: false }],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'sync',
      do: [
        { set: 'working', value: true },
        { call: 'resync', onSuccess: [{ set: 'working', value: false }, { call: 'load' }, { call: 'loadOffer' }], onError: [{ set: 'working', value: false }] },
      ],
    },
    { message: 'capabilities-changed', do: [{ call: 'load' }] },
    ...previewTriggers,
  ],
};

export const deployConnectorsInputSchema = z.toJSONSchema(
  z.object({
    selected: z
      .object({ connector_id: z.string().optional(), name: z.string().optional() })
      .optional()
      .describe('Open with this connector’s offer checklist showing — connector_id and display name from connectors/list.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the composed console); true (default) the full checklist.'),
  }),
);
