import type { PrismStory } from '../../story-types';

export const caseStory: PrismStory = {
  id: 'case',
  name: '$case',
  description:
    'Conditional branching. Branches are evaluated in order; the first whose `when` is truthy returns its `then`. Falls back to `else` if none match.',
  category: 'Operators',
  kind: 'transform',
  input: { score: 87 },
  config: {
    $case: {
      branches: [
        { when: { $gte: [{ $ref: '$.score' }, { $const: 90 }] }, then: { $const: 'A' } },
        { when: { $gte: [{ $ref: '$.score' }, { $const: 80 }] }, then: { $const: 'B' } },
        { when: { $gte: [{ $ref: '$.score' }, { $const: 70 }] }, then: { $const: 'C' } },
      ],
      else: { $const: 'F' },
    },
  },
  expected: 'B',
};
