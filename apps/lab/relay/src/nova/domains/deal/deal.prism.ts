import { dealById, dealMarkWon, dealMarkLost } from '@relay/api/deals';
import { activitiesByDeal, dealLineItems } from '@relay/api/activities';
import { tasksByDeal } from '@relay/api/tasks';
import { contactById } from '@relay/api/contacts';

// The deal workspace — several reads, each into a top-level slot. Each prism is a
// full Vex request body, attached to an endpoint's `request`. The primary contact
// keys off `$.record.primary_contact_id`, so its endpoint runs after the record
// loads (see the action's mount sequence).
export const dealByIdPrism = { shape: { $const: dealById.shape }, context: { id: { $ref: '$.id' } } };
export const dealActivitiesPrism = { shape: { $const: activitiesByDeal.shape }, context: { id: { $ref: '$.id' } } };
export const dealLineItemsPrism = { shape: { $const: dealLineItems.shape }, context: { id: { $ref: '$.id' } } };
export const dealTasksPrism = { shape: { $const: tasksByDeal.shape }, context: { id: { $ref: '$.id' } } };
export const dealContactPrism = { shape: { $const: contactById.shape }, context: { id: { $ref: '$.record.primary_contact_id' } } };

// Won/lost writes only need the open deal's id.
export const markWonPrism = {
  mutation: { $const: dealMarkWon },
  context: { deal_id: { $ref: '$.record.deal_id' } },
};
export const markLostPrism = {
  mutation: { $const: dealMarkLost },
  context: { deal_id: { $ref: '$.record.deal_id' } },
};
