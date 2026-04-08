import type { PrismStory } from '../../story-types';

export const stringsStory: PrismStory = {
  id: 'strings',
  name: 'String ops',
  description:
    'String manipulation primitives: `$lower`, `$upper`, `$trim`, `$split`, `$replace`, `$length`. Each consumes a string (or string expression) and returns a transformed value.',
  category: 'Operators',
  kind: 'transform',
  input: { raw: '  Ada Lovelace  ', csv: 'apple,banana,cherry,date' },
  config: {
    cleaned: { $trim: { $ref: '$.raw' } },
    upper: { $upper: { $trim: { $ref: '$.raw' } } },
    lower: { $lower: { $trim: { $ref: '$.raw' } } },
    fruits: { $split: { value: { $ref: '$.csv' }, sep: ',' } },
    fruitCount: { $length: { $split: { value: { $ref: '$.csv' }, sep: ',' } } },
    censored: {
      $replace: {
        value: { $ref: '$.csv' },
        search: 'banana',
        replacement: '***',
      },
    },
  },
  expected: {
    cleaned: 'Ada Lovelace',
    upper: 'ADA LOVELACE',
    lower: 'ada lovelace',
    fruits: ['apple', 'banana', 'cherry', 'date'],
    fruitCount: 4,
    censored: 'apple,***,cherry,date',
  },
};
