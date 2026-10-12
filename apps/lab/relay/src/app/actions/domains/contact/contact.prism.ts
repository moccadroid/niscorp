import { contactById } from '@relay/app/vex/contacts.entries';
import { dealsByContact } from '@relay/app/vex/deals.entries';
import { tasksByContact } from '@relay/app/vex/tasks.entries';
import { activitiesByContact } from '@relay/app/vex/activities.entries';

export const contactByIdPrism = { fingerprint: contactById.fingerprint, context: { id: { $ref: '$.id' } } };
export const contactDealsPrism = { fingerprint: dealsByContact.fingerprint, context: { contactId: { $ref: '$.id' } } };
export const contactTasksPrism = { fingerprint: tasksByContact.fingerprint, context: { contactId: { $ref: '$.id' } } };
export const contactActivityPrism = { fingerprint: activitiesByContact.fingerprint, context: { contactId: { $ref: '$.id' } } };
