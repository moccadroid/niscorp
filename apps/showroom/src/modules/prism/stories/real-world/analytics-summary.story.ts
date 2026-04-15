import * as demo from './analytics-summary.demo';
import source from './analytics-summary.demo?raw';

export const story = {
  id: 'analytics-summary',
  name: 'Analytics summary',
  description:
    'Compute a small dashboard from raw events: total revenue, average order value, top customer by spend, count of orders. Demonstrates `$sum`, `$avg`, `$max` (over a derived array), `$count`, and `$pluck` working together.',
  category: 'Real world',
  kind: 'transform' as const,
  ...demo,
  source,
};
