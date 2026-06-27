import { actionsSearch } from '@relay/api/actions';

// An empty box matches nothing (a sentinel pattern), so the palette only shows
// results once you type; otherwise the typed text becomes a `%q%` ILIKE pattern.
export const topbarPrism: Record<string, unknown> = {
  'topbar.search': {
    shape: { $const: actionsSearch.shape },
    context: {
      q: { $case: { branches: [{ when: { $ref: '$.search' }, then: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } } }], else: ' ' } },
    },
  },
};
