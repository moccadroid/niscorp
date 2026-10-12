import { contactsList, contactDelete } from '@relay/app/vex/contacts.entries';

export const listContactsPrism = {
  fingerprint: contactsList.fingerprint,
  context: {
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
    sortBy: { $ref: '$.sortBy' },
    sortDir: { $ref: '$.sortDir' },
  },
};

export const deleteContactPrism = {
  fingerprint: contactDelete.fingerprint,
  context: { id: { $ref: '$.pendingDeleteId' } },
};
