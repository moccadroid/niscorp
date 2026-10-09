import { compile, search, TreeInterpreter } from '@jmespath-community/jmespath';

// qty × unitCents over the lines of the order in context, plus its shipping.
const TOTAL = 'sum(map(&(qty * unitCents), items)) + shippingCents';

export default {
  id: 'jmespath-community',
  name: 'JMESPath Community',
  package: '@jmespath-community/jmespath',
  transform: 'string',
  usesEval: false,
  prepared: true,
  notes: 'The JMESPath Community specification: arithmetic, let, group_by, items and from_items, string functions, and a ternary this package calls experimental. prepare is compile (to a syntax tree); run is TreeInterpreter.search, as its README shows.',
  prepare: (source) => compile(source),
  run: (ast, input) => TreeInterpreter.search(ast, input),
  oneShot: (source, input) => search(input, source),

  tasks: {
    project: { source: '{id: id, name: customer.name, email: customer.email, city: customer.address.city}' },

    reshape: {
      source: `{
  order: {id: id, status: status},
  buyer: {name: customer.name, location: {city: customer.address.city, country: customer.address.country}},
  lines: items[*].{sku: sku, qty: qty}
}`,
    },

    strings: {
      source: `{
  contact: join('', [customer.name, ' <', customer.email, '>']),
  skus: join(', ', items[*].sku),
  city: upper(customer.address.city)
}`,
    },

    conditional: {
      source: `{
  id: id,
  service: customer.tier == 'gold' ? 'priority' : customer.tier == 'silver' ? 'standard' : 'basic',
  next: status == 'paid' ? (shippingCents == \`0\` ? 'ship-free' : 'ship') : status == 'pending' ? 'hold' : 'closed'
}`,
    },

    defaults: { source: "{id: id, currency: 'EUR', gift: `false`, notes: not_null(notes, ''), coupon: not_null(couponCode, 'NONE')}" },

    dates: { notExpressible: 'No date functions: a timestamp cannot be turned into a number, so the days between two of them cannot be counted.' },

    rule: { source: "status == 'paid' && (customer.tier == 'gold' || shippingCents >= `1000`) && length(items[?qty >= `3`]) > `0`" },

    totals: { source: `orders[*].{id: id, totalCents: ${TOTAL}, units: sum(items[*].qty)}` },

    top: { source: "reverse(sort_by(orders[?status == 'paid' && customer.tier == 'gold'], &placedAt))[:10].{id: id, placedAt: placedAt}" },

    groups: {
      source: 'from_items(items(group_by(orders, &customer.address.country))[*].[@[0], {orders: length(@[1]), shippingCents: sum(@[1][*].shippingCents)}])',
    },

    screen: {
      source: `let $paid = orders[?status == 'paid'] in {
  count: length($paid),
  revenueCents: sum(map(&(${TOTAL}), $paid)),
  rows: reverse(sort_by($paid, &placedAt))[:20].{
    id: id,
    buyer: customer.name,
    city: customer.address.city,
    totalCents: ${TOTAL},
    skus: join(', ', items[*].sku)
  }
}`,
    },
  },
};
