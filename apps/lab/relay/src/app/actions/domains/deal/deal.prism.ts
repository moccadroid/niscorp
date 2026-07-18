import { dealById, dealMarkWon, dealMarkLost } from '@relay/app/vex/deals.entries';
import { activitiesByDeal, dealLineItems } from '@relay/app/vex/activities.entries';
import { tasksByDeal } from '@relay/app/vex/tasks.entries';
import { contactById } from '@relay/app/vex/contacts.entries';

// The deal workspace — several reads, each into a top-level slot. Each prism is a
// full Vex request body, attached to an endpoint's `request`. The primary contact
// keys off `$.record.primary_contact_id`, so its endpoint runs after the record
// loads (see the action's mount sequence).
export const dealByIdPrism = { fingerprint: dealById.fingerprint, context: { id: { $ref: '$.id' } } };
export const dealActivitiesPrism = { fingerprint: activitiesByDeal.fingerprint, context: { id: { $ref: '$.id' } } };
export const dealLineItemsPrism = { fingerprint: dealLineItems.fingerprint, context: { id: { $ref: '$.id' } } };
export const dealTasksPrism = { fingerprint: tasksByDeal.fingerprint, context: { id: { $ref: '$.id' } } };
export const dealContactPrism = { fingerprint: contactById.fingerprint, context: { id: { $ref: '$.record.primary_contact_id' } } };

// Won/lost writes only need the open deal's id.
export const markWonPrism = {
  fingerprint: dealMarkWon.fingerprint,
  context: { deal_id: { $ref: '$.record.deal_id' } },
};
export const markLostPrism = {
  fingerprint: dealMarkLost.fingerprint,
  context: { deal_id: { $ref: '$.record.deal_id' } },
};
