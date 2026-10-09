// The code baseline with a utility library: each task as the lodash calls a developer would normally write.

import _ from 'lodash';

const DAY = 86_400_000;

const totalCents = (order) => _.sumBy(order.items, (item) => item.qty * item.unitCents) + order.shippingCents;

const FUNCTIONS = {
  project: (order) => ({
    id: order.id,
    name: _.get(order, 'customer.name'),
    email: _.get(order, 'customer.email'),
    city: _.get(order, 'customer.address.city'),
  }),

  reshape: (order) => ({
    order: _.pick(order, ['id', 'status']),
    buyer: { name: _.get(order, 'customer.name'), location: _.pick(order.customer.address, ['city', 'country']) },
    lines: _.map(order.items, (item) => _.pick(item, ['sku', 'qty'])),
  }),

  strings: (order) => ({
    contact: `${order.customer.name} <${order.customer.email}>`,
    skus: _.join(_.map(order.items, 'sku'), ', '),
    city: _.toUpper(order.customer.address.city),
  }),

  conditional: (order) => ({
    id: order.id,
    service: order.customer.tier === 'gold' ? 'priority' : order.customer.tier === 'silver' ? 'standard' : 'basic',
    next: order.status === 'paid' ? (order.shippingCents === 0 ? 'ship-free' : 'ship') : order.status === 'pending' ? 'hold' : 'closed',
  }),

  defaults: (order) => ({
    id: order.id,
    currency: 'EUR',
    gift: false,
    notes: _.defaultTo(order.notes, ''),
    coupon: _.defaultTo(order.couponCode, 'NONE'),
  }),

  dates: (order) => ({
    id: order.id,
    day: order.placedAt.slice(0, 10),
    ageDays: _.floor((Date.parse(order.now) - Date.parse(order.placedAt)) / DAY),
  }),

  rule: (order) =>
    order.status === 'paid' && (order.customer.tier === 'gold' || order.shippingCents >= 1000) && _.some(order.items, (item) => item.qty >= 3),

  totals: ({ orders }) => _.map(orders, (order) => ({ id: order.id, totalCents: totalCents(order), units: _.sumBy(order.items, 'qty') })),

  top: ({ orders }) => {
    const wanted = _.filter(orders, { status: 'paid', customer: { tier: 'gold' } });
    return _.map(_.take(_.orderBy(wanted, 'placedAt', 'desc'), 10), (order) => _.pick(order, ['id', 'placedAt']));
  },

  groups: ({ orders }) =>
    _.mapValues(_.groupBy(orders, 'customer.address.country'), (group) => ({ orders: group.length, shippingCents: _.sumBy(group, 'shippingCents') })),

  screen: ({ orders }) => {
    const paid = _.filter(orders, { status: 'paid' });
    return {
      count: paid.length,
      revenueCents: _.sumBy(paid, totalCents),
      rows: _.map(_.take(_.orderBy(paid, 'placedAt', 'desc'), 20), (order) => ({
        id: order.id,
        buyer: order.customer.name,
        city: order.customer.address.city,
        totalCents: totalCents(order),
        skus: _.join(_.map(order.items, 'sku'), ', '),
      })),
    };
  },
};

export default {
  id: 'lodash',
  name: 'lodash',
  package: 'lodash',
  transform: 'code',
  usesEval: false,
  prepared: false,
  notes: 'Code, not a transform that can be stored: each task as a function over lodash calls (plain calls, not _.chain). The total of an order is a helper shared by totals and screen; lodash has no date functions, so dates is plain JavaScript.',
  prepare: (source) => source,
  run: (fn, input) => fn(input),
  oneShot: (fn, input) => fn(input),
  // structuredClone cannot carry a function, so the source is its text and the function is found by task id.
  tasks: Object.fromEntries(
    Object.entries(FUNCTIONS).map(([id, fn]) => [id, { source: fn.toString(), prepare: () => fn, oneShot: (_source, input) => fn(input) }]),
  ),
};
