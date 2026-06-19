import { dealsList, dealsByOwner } from '@relay/api/deals';

// `$.ownerId`: '' → all deals (the `dealsList` shape); 'me' → the current user
// (the My-deals tab); any other value → that owner (an owner cross-link). When
// it's set the seam switches to the `dealsByOwner` shape (the cache key Vex looks
// up); 'me' resolves to the injected `$.userId`.
export const dealsPrism: Record<string, unknown> = {
  'deals.list': {
    shape: {
      $case: {
        branches: [{ when: { $ref: '$.ownerId' }, then: { $const: dealsByOwner.shape } }],
        else: { $const: dealsList.shape },
      },
    },
    context: {
      q: { $join: { parts: ['%', { $ref: '$.q' }, '%'], sep: '' } },
      ownerId: { $case: { branches: [{ when: { $eq: [{ $ref: '$.ownerId' }, 'me'] }, then: { $ref: '$.userId' } }], else: { $ref: '$.ownerId' } } },
      sortBy: { $ref: '$.sortBy' },
      sortDir: { $ref: '$.sortDir' },
    },
  },
};
