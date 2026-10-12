import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { movementsLayout } from './movements.layout';
import { previewable, previewTriggers, crewCard } from '@atrium/app/actions/preview';
import { movementsTodayPrism } from './desk.prism';

export const deskMovementsAction: ActionDefinition = {
  id: 'desk.movements',
  title: 'Arrivals & departures',
  data: { propertyId: '', search: '', scope: 'all', rows: [], loading: true, expanded: true },
  layout: previewable(
    crewCard('Arrivals & departures', 'door', {
      $if: '$.rows.length',
      $then: '{{$.rows.length}} movements — next in {{$.rows.0.guest_name}}, room {{$.rows.0.room_number}}',
      $else: 'A quiet day — nobody in or out.',
    }),
    movementsLayout,
  ),
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: movementsTodayPrism, target: 'rows' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'tab', do: [{ set: 'scope', value: '@event.payload' }, { call: 'load' }] },
    { event: 'ui:click', ref: 'row', do: [{ resetTo: { action: 'desk.guest', canvas: 'detail', input: { stayId: '@event.payload.stay_id', propertyId: '$.propertyId' }, with: ['detail'] } }] },
    { event: 'ui:click', ref: 'open', do: [{ resetTo: { action: 'desk.guest', canvas: 'detail', input: { stayId: '@event.payload.stay_id', propertyId: '$.propertyId' }, with: ['detail'] } }] },
    { message: 'stay-changed', do: [{ call: 'load' }] },
    { message: 'rooms-changed', do: [{ call: 'load' }] },
    ...previewTriggers,
  ],
};

export const deskMovementsInputSchema = z.toJSONSchema(
  z.object({
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    scope: z.enum(['all', 'due', 'staying']).optional().describe('Which slice to open on. `due` is everybody still to walk in.'),
    search: z.string().optional().describe('Open the list already filtered to a guest’s name.'),
    expanded: z.boolean().optional().describe('false renders the one-line card (the composed crew surface); true (default) the full list.'),
  }),
);
