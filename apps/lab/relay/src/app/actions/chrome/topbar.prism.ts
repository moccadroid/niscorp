import { actionsSearch } from '@relay/app/vex/actions.entries';

// With an empty search box the pattern is ' ', which matches no action.
export const topbarSearchPrism = {
  fingerprint: actionsSearch.fingerprint,
  context: {
    q: { $case: { branches: [{ when: { $ref: '$.search' }, then: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } } }], else: ' ' } },
    allowedIds: { $ref: '$.allowedIds' },
  },
};
