import { contactById } from '@relay/api/contacts';
import { dealsByContact } from '@relay/api/deals';
import { tasksByContact } from '@relay/api/tasks';
import { activitiesByContact } from '@relay/api/activities';

// The contact profile is four reads into top-level slots — the record, plus the
// related deals / tasks / activity that make the panel as rich as the company
// profile and the deal workspace. Each prism is a full Vex query body, attached
// to an endpoint's `request`. The layout binds the slots; nothing assembles in JS.
export const contactByIdPrism = { shape: { $const: contactById.shape }, context: { id: { $ref: '$.id' } } };
export const contactDealsPrism = { shape: { $const: dealsByContact.shape }, context: { contactId: { $ref: '$.id' } } };
export const contactTasksPrism = { shape: { $const: tasksByContact.shape }, context: { contactId: { $ref: '$.id' } } };
export const contactActivityPrism = { shape: { $const: activitiesByContact.shape }, context: { contactId: { $ref: '$.id' } } };
