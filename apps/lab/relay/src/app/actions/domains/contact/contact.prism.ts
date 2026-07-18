import { contactById } from '@relay/app/vex/contacts.entries';
import { dealsByContact } from '@relay/app/vex/deals.entries';
import { tasksByContact } from '@relay/app/vex/tasks.entries';
import { activitiesByContact } from '@relay/app/vex/activities.entries';

// The contact profile is four reads into top-level slots — the record, plus the
// related deals / tasks / activity that make the panel as rich as the company
// profile and the deal workspace. Each prism is a full Vex query body, attached
// to an endpoint's `request`. The layout binds the slots; nothing assembles in JS.
export const contactByIdPrism = { fingerprint: contactById.fingerprint, context: { id: { $ref: '$.id' } } };
export const contactDealsPrism = { fingerprint: dealsByContact.fingerprint, context: { contactId: { $ref: '$.id' } } };
export const contactTasksPrism = { fingerprint: tasksByContact.fingerprint, context: { contactId: { $ref: '$.id' } } };
export const contactActivityPrism = { fingerprint: activitiesByContact.fingerprint, context: { contactId: { $ref: '$.id' } } };
