import { contactsList } from '@relay/api/contacts';

// The screen's data seam, keyed by the `fn` an endpoint calls. Plain Prism over
// the action data → the Vex request `{ shape, context }`. The shape (the cache
// key) is the api entry's; the toolbar search becomes a `%q%` ILIKE pattern;
// `sortBy`/`sortDir` are Vex's reserved context keys (drive ORDER BY).
export const contactsReads: Record<string, unknown> = {
  'contacts.list': {
    shape: { $const: contactsList.shape },
    context: {
      q: { $join: { parts: ['%', { $ref: '$.q' }, '%'], sep: '' } },
      sortBy: { $ref: '$.sortBy' },
      sortDir: { $ref: '$.sortDir' },
    },
  },
};
