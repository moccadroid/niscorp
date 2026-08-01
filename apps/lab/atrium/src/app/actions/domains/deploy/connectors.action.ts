import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { connectorsLayout } from './connectors.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { connectorsPrism, offerPrism, reachPrism, stageOnPrism, stageOffPrism } from './deploy.prism';

// The integrator's console, and the whole argument of the app in one screen.
//
// A connector's offer is a CHECKLIST: every capability the integration
// implements, each with a switch. Shipping is three gestures and none of them
// is a deploy:
//
//   1. stage   — flip switches. Each one is a row update in
//                connector_capabilities; the resolved layer has not moved yet.
//   2. go live — `connector.resync` recomputes the resolved layer from the
//                staged offer, then `refresh()` reloads bundle actions from
//                rows, re-verifies the charter, and walks every living shell
//                so it adopts the new definitions in place.
//   3. read    — every other shell picks the change up on its next
//                mount/resume, because the database is the bus.
//
// Versions still exist — as provenance on each row ("arrived in v2"), the way
// an audit line should. Nothing resolves against them anymore.
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
    // What the last go-live's PULL said, per connector — landed, or the
    // reasons intake refused it. The console is where a bad bundle becomes
    // visible, and it is the only place it needs to be.
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
  // loadOffer/loadReach also run at mount: with no `selected` seeded they read
  // against an empty connector id and return nothing, harmlessly; seeded (an
  // opener or Vega's agent aiming the console), the checklist arrives open.
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadOffer' }, { call: 'loadReach' }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'pick',
      do: [{ set: 'selected', value: '@event.payload' }, { set: 'shipped', value: false }, { set: 'dirty', value: false }, { call: 'loadOffer' }, { call: 'loadReach' }],
    },
    // Staging: the row updates, the checklist re-reads, and the console owns up
    // to being ahead of the world until "Go live" runs the resync.
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
    // The pull on its own — no staged switches required. Same fn as go live
    // (a pull IS the deployment step; going live just adds staged rows in
    // front of it), and the report lands in the same place.
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
