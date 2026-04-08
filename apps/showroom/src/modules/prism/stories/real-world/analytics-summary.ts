import type { PrismStory } from '../../story-types';

export const analyticsSummaryStory: PrismStory = {
  id: 'analytics-summary',
  name: 'Analytics summary',
  description:
    'Compute a small dashboard from raw events: total revenue, average order value, top customer by spend, count of orders. Demonstrates `$sum`, `$avg`, `$max` (over a derived array), `$count`, and `$pluck` working together.',
  category: 'Real world',
  kind: 'transform',
  input: {
    orders: [
      { id: 'o1', customer: 'Ada', amount: 120 },
      { id: 'o2', customer: 'Grace', amount: 85 },
      { id: 'o3', customer: 'Ada', amount: 200 },
      { id: 'o4', customer: 'Linus', amount: 45 },
      { id: 'o5', customer: 'Grace', amount: 175 },
      { id: 'o6', customer: 'Ada', amount: 60 },
    ],
  },
  config: {
    totalRevenue: { $sum: { over: { $pluck: { over: { $ref: '$.orders' }, key: 'amount' } } } },
    avgOrder: { $avg: { over: { $pluck: { over: { $ref: '$.orders' }, key: 'amount' } } } },
    maxOrder: { $max: { over: { $pluck: { over: { $ref: '$.orders' }, key: 'amount' } } } },
    orderCount: { $count: { over: { $ref: '$.orders' } } },
    uniqueCustomers: { $unique: { $pluck: { over: { $ref: '$.orders' }, key: 'customer' } } },
  },
  expected: {
    totalRevenue: 685,
    avgOrder: 685 / 6,
    maxOrder: 200,
    orderCount: 6,
    uniqueCustomers: ['Ada', 'Grace', 'Linus'],
  },
};
