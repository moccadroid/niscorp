import type { PrismStory } from '../../story-types';

export const datesStory: PrismStory = {
  id: 'dates',
  name: 'Date ops',
  description:
    '`$date` formats a date via a dayjs format string; `$dateAdd` shifts a date by an amount and unit; `$dateDiff` returns the difference between two dates in the requested unit.',
  category: 'Operators',
  kind: 'transform',
  input: { createdAt: '2024-01-15T08:30:00Z', now: '2024-04-22T10:00:00Z' },
  config: {
    formatted: { $date: { value: { $ref: '$.createdAt' }, format: 'YYYY-MM-DD' } },
    plus30Days: {
      $date: {
        value: {
          $dateAdd: { date: { $ref: '$.createdAt' }, amount: 30, unit: 'day' },
        },
        format: 'YYYY-MM-DD',
      },
    },
    daysSinceCreated: {
      $dateDiff: { from: { $ref: '$.createdAt' }, to: { $ref: '$.now' }, unit: 'day' },
    },
  },
  expected: {
    formatted: '2024-01-15',
    plus30Days: '2024-02-14',
    daysSinceCreated: 98,
  },
};
