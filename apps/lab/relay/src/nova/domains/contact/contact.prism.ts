import { contactById } from '@relay/api/contacts';
import { dealsByContact } from '@relay/api/deals';
import { tasksByContact } from '@relay/api/tasks';
import { activitiesByContact } from '@relay/api/activities';

// The contact profile is four reads into slots of `$.view` — the record, plus the
// related deals / tasks / activity that make the panel as rich as the company
// profile and the deal workspace. The layout binds the slots; nothing assembles
// in JS.
export const contactReads: Record<string, unknown> = {
  'contact.byId': { shape: { $const: contactById.shape }, context: { id: { $ref: '$.id' } } },
  'contact.deals': { shape: { $const: dealsByContact.shape }, context: { contactId: { $ref: '$.id' } } },
  'contact.tasks': { shape: { $const: tasksByContact.shape }, context: { contactId: { $ref: '$.id' } } },
  'contact.activity': { shape: { $const: activitiesByContact.shape }, context: { contactId: { $ref: '$.id' } } },
};
