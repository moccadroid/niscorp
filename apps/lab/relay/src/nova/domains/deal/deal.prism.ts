import { dealById } from '@relay/api/deals';
import { activitiesByDeal, dealLineItems } from '@relay/api/activities';
import { tasksByDeal } from '@relay/api/tasks';
import { contactById } from '@relay/api/contacts';

// The deal workspace — several reads into slots of `$.view`. The primary contact
// keys off `$.view.record.primary_contact_id`, so its endpoint runs after the
// record loads (see the action's mount sequence).
export const dealReads: Record<string, unknown> = {
  'deal.byId': { shape: { $const: dealById.shape }, context: { id: { $ref: '$.id' } } },
  'deal.activities': { shape: { $const: activitiesByDeal.shape }, context: { id: { $ref: '$.id' } } },
  'deal.lineItems': { shape: { $const: dealLineItems.shape }, context: { id: { $ref: '$.id' } } },
  'deal.tasks': { shape: { $const: tasksByDeal.shape }, context: { id: { $ref: '$.id' } } },
  'deal.contact': { shape: { $const: contactById.shape }, context: { id: { $ref: '$.view.record.primary_contact_id' } } },
};

// Mutation input seam: won/lost only need the open deal's id.
export const dealMutations: Record<string, unknown> = {
  'deal.markWon': { deal_id: { $ref: '$.view.record.deal_id' } },
  'deal.markLost': { deal_id: { $ref: '$.view.record.deal_id' } },
};
