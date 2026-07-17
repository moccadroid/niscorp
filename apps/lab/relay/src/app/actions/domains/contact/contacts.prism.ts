import { contactsList, contactDelete } from '@relay/app/data/api/contacts';

// Read/write seams for the contacts list — each a full Vex request body, attached
// to an endpoint's `request`. (Query → { fingerprint, context }; write → { mutation,
// context }.)

// List contacts (search + sort). The shape (the cache key) is the api entry's; the
// toolbar search becomes a `%q%` ILIKE pattern; `sortBy`/`sortDir` are Vex's
// reserved context keys (drive ORDER BY).
export const listContactsPrism = {
  fingerprint: contactsList.fingerprint,
  context: {
    q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } },
    sortBy: { $ref: '$.sortBy' },
    sortDir: { $ref: '$.sortDir' },
  },
};

// Delete the pending contact (id stashed in `$.pendingDeleteId` by the ⋯ → Delete).
export const deleteContactPrism = {
  fingerprint: contactDelete.fingerprint,
  context: { id: { $ref: '$.pendingDeleteId' } },
};
