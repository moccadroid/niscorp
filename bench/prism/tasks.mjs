// The tasks. Each one is its input and a plain function: what that function returns IS the answer, and every
// library is held to it before it is timed (harness/check.mjs). The function is also the "hand-written" row.
//
// Two kinds of input:
//   record      one order                       sizes: [1]
//   collection  { orders: Order[], now }        sizes: [100, 10000]
// The order shape is in data.mjs.

import { makeOrder, makeOrders, NOW } from './data.mjs';

const totalCents = (order) => order.items.reduce((sum, item) => sum + item.qty * item.unitCents, 0) + order.shippingCents;
const DAY = 86_400_000;

const record = (size, seed = 1) => makeOrder(size === 1 ? 6 : size, seed);
const collection = (size, seed = 1) => ({ orders: makeOrders(size, seed), now: NOW });

export const TASKS = [
  {
    id: 'project',
    title: 'Pick and rename fields',
    kind: 'record',
    sizes: [1],
    words: 'Four fields out of one order, two of them from nested objects, under new names.',
    input: record,
    reference: (order) => ({ id: order.id, name: order.customer.name, email: order.customer.email, city: order.customer.address.city }),
  },
  {
    id: 'reshape',
    title: 'Reshape into a nested object',
    kind: 'record',
    sizes: [1],
    words: 'A new nested shape, with the order lines mapped to { sku, qty }.',
    input: record,
    reference: (order) => ({
      order: { id: order.id, status: order.status },
      buyer: { name: order.customer.name, location: { city: order.customer.address.city, country: order.customer.address.country } },
      lines: order.items.map((item) => ({ sku: item.sku, qty: item.qty })),
    }),
  },
  {
    id: 'strings',
    title: 'Build strings',
    kind: 'record',
    sizes: [1],
    words: 'An interpolated string, a joined list, an upper-cased field.',
    input: record,
    reference: (order) => ({
      contact: `${order.customer.name} <${order.customer.email}>`,
      skus: order.items.map((item) => item.sku).join(', '),
      city: order.customer.address.city.toUpperCase(),
    }),
  },
  {
    id: 'conditional',
    title: 'Choose by condition',
    kind: 'record',
    sizes: [1],
    words: 'A three-way choice on one field and a nested choice on two.',
    input: record,
    reference: (order) => ({
      id: order.id,
      service: order.customer.tier === 'gold' ? 'priority' : order.customer.tier === 'silver' ? 'standard' : 'basic',
      next: order.status === 'paid' ? (order.shippingCents === 0 ? 'ship-free' : 'ship') : order.status === 'pending' ? 'hold' : 'closed',
    }),
  },
  {
    id: 'defaults',
    title: 'Fill in what is missing',
    kind: 'record',
    sizes: [1],
    words: 'A missing key and a null each fall back to a default; two constants are added.',
    input: record,
    reference: (order) => ({ id: order.id, currency: 'EUR', gift: false, notes: order.notes ?? '', coupon: order.couponCode ?? 'NONE' }),
  },
  {
    id: 'dates',
    title: 'Format a date and count days',
    kind: 'record',
    sizes: [1],
    words: "The order's day as YYYY-MM-DD (UTC), and the whole days from then to a fixed moment, 2026-10-01T00:00:00Z.",
    input: (size, seed) => ({ ...record(size, seed), now: NOW }),
    reference: (order) => ({ id: order.id, day: order.placedAt.slice(0, 10), ageDays: Math.floor((Date.parse(order.now) - Date.parse(order.placedAt)) / DAY) }),
  },
  {
    id: 'rule',
    title: 'Answer a yes/no rule',
    kind: 'record',
    sizes: [1],
    words: 'Paid, and gold or shipping of at least 1000, and some line with a quantity of 3 or more. The answer is a boolean.',
    input: record,
    reference: (order) => order.status === 'paid' && (order.customer.tier === 'gold' || order.shippingCents >= 1000) && order.items.some((item) => item.qty >= 3),
  },
  {
    id: 'totals',
    title: 'Map with a computed field',
    kind: 'collection',
    sizes: [100, 10000],
    words: "For every order: its id, its total (each line's qty × unitCents, plus shipping) and how many units it holds.",
    input: collection,
    reference: ({ orders }) => orders.map((order) => ({ id: order.id, totalCents: totalCents(order), units: order.items.reduce((sum, item) => sum + item.qty, 0) })),
  },
  {
    id: 'top',
    title: 'Filter, sort, take',
    kind: 'collection',
    sizes: [100, 10000],
    words: 'Paid orders of gold customers, newest first by placedAt (unique, ISO, so string order is time order), the first ten, as { id, placedAt }.',
    input: collection,
    reference: ({ orders }) =>
      orders
        .filter((order) => order.status === 'paid' && order.customer.tier === 'gold')
        .sort((a, b) => (a.placedAt < b.placedAt ? 1 : a.placedAt > b.placedAt ? -1 : 0))
        .slice(0, 10)
        .map((order) => ({ id: order.id, placedAt: order.placedAt })),
  },
  {
    id: 'groups',
    title: 'Group and aggregate',
    kind: 'collection',
    sizes: [100, 10000],
    words: "By the customer's country: how many orders, and the sum of their shipping. An object keyed by country.",
    input: collection,
    reference: ({ orders }) => {
      const out = {};
      for (const order of orders) {
        const group = (out[order.customer.address.country] ??= { orders: 0, shippingCents: 0 });
        group.orders += 1;
        group.shippingCents += order.shippingCents;
      }
      return out;
    },
  },
  {
    id: 'screen',
    title: 'An API answer into a screen model',
    kind: 'collection',
    sizes: [100, 10000],
    words: 'The paid orders: how many, their revenue, and the twenty newest as rows of { id, buyer, city, totalCents, skus }.',
    input: collection,
    reference: ({ orders }) => {
      const paid = orders.filter((order) => order.status === 'paid');
      return {
        count: paid.length,
        revenueCents: paid.reduce((sum, order) => sum + totalCents(order), 0),
        rows: [...paid]
          .sort((a, b) => (a.placedAt < b.placedAt ? 1 : a.placedAt > b.placedAt ? -1 : 0))
          .slice(0, 20)
          .map((order) => ({
            id: order.id,
            buyer: order.customer.name,
            city: order.customer.address.city,
            totalCents: totalCents(order),
            skus: order.items.map((item) => item.sku).join(', '),
          })),
      };
    },
  },
];

export const taskOf = (id) => {
  const task = TASKS.find((t) => t.id === id);
  if (task === undefined) throw new Error(`No task "${id}". Tasks: ${TASKS.map((t) => t.id).join(', ')}`);
  return task;
};

// The inputs a library is checked against: the timed input of each size, and others chosen so that every branch
// of every task is taken (each status, each tier, a note and none, a coupon and none, free shipping and not).
export const checkInputs = (task) => {
  const inputs = task.sizes.map((size) => task.input(size, 1));
  if (task.kind === 'record') for (let index = 0; index < 40; index += 1) inputs.push(task.input(100 + index, 2));
  else inputs.push(task.input(37, 3), task.input(1, 4), { ...task.input(0, 5) });
  return inputs;
};
