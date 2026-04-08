import type { PrismStory } from '../../story-types';

export const interpolateStory: PrismStory = {
  id: 'interpolate',
  name: '$interpolate',
  description:
    'Replaces `{{key}}` placeholders in a template string with the matching values from an object. Both the template and the values can be expressions.',
  category: 'Operators',
  kind: 'transform',
  input: { user: { first: 'Ada', last: 'Lovelace' }, count: 3 },
  config: {
    $interpolate: {
      template: 'Welcome, {{first}} {{last}}! You have {{count}} new messages.',
      values: {
        first: { $ref: '$.user.first' },
        last: { $ref: '$.user.last' },
        count: { $ref: '$.count' },
      },
    },
  },
  expected: 'Welcome, Ada Lovelace! You have 3 new messages.',
};
