import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';

// Compute a small dashboard from raw events: total revenue,
// average order value, top customer by spend, count of orders.
// Demonstrates $sum, $avg, $max (over a derived array), $count,
// and $pluck working together.

export const input: JsonObject = {
  orders: [
    { id: 'o1', customer: 'Ada', amount: 120 },
    { id: 'o2', customer: 'Grace', amount: 85 },
    { id: 'o3', customer: 'Ada', amount: 200 },
    { id: 'o4', customer: 'Linus', amount: 45 },
    { id: 'o5', customer: 'Grace', amount: 175 },
    { id: 'o6', customer: 'Ada', amount: 60 },
  ],
};

export const config = {
  totalRevenue: { $sum: { over: { $pluck: { over: { $ref: '$.orders' }, key: 'amount' } } } },
  avgOrder: { $avg: { over: { $pluck: { over: { $ref: '$.orders' }, key: 'amount' } } } },
  maxOrder: { $max: { over: { $pluck: { over: { $ref: '$.orders' }, key: 'amount' } } } },
  orderCount: { $count: { over: { $ref: '$.orders' } } },
  uniqueCustomers: { $unique: { $pluck: { over: { $ref: '$.orders' }, key: 'customer' } } },
};

export const Demo = () => <PrismView input={input} config={config} />;
