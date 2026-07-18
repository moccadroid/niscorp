import { actionsSearch } from '@relay/app/vex/actions.entries';

// An empty box matches nothing (a sentinel pattern), so the palette only shows
// results once you type; otherwise the typed text becomes a `%q%` ILIKE pattern.
// `allowedIds` is the principal's granted action ids (seeded into the topbar at
// boot) — the read is constrained to the catalog, so the palette can only ever
// surface actions this principal may run. A full Vex query body.
export const topbarSearchPrism = {
  fingerprint: actionsSearch.fingerprint,
  context: {
    q: { $case: { branches: [{ when: { $ref: '$.search' }, then: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } } }], else: ' ' } },
    allowedIds: { $ref: '$.allowedIds' },
  },
};
