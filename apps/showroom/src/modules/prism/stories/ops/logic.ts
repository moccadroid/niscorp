import type { PrismStory } from '../../story-types';

export const logicStory: PrismStory = {
  id: 'logic',
  name: 'Logic ops',
  description:
    '`$and`, `$or`, `$not` — boolean combinators with short-circuit semantics. `$and` returns the last truthy value or the first falsy; `$or` returns the first truthy or the last falsy; `$not` flips truthiness.',
  category: 'Operators',
  kind: 'transform',
  input: {
    user: { age: 25, hasPaidPlan: true, isVerified: false },
  },
  config: {
    canAccess: {
      $and: [
        { $gte: [{ $ref: '$.user.age' }, { $const: 18 }] },
        { $ref: '$.user.hasPaidPlan' },
      ],
    },
    needsVerification: { $not: { $ref: '$.user.isVerified' } },
    canPostOrCanComment: {
      $or: [{ $ref: '$.user.hasPaidPlan' }, { $ref: '$.user.isVerified' }],
    },
  },
  expected: {
    canAccess: true,
    needsVerification: true,
    canPostOrCanComment: true,
  },
};
