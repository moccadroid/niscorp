import jmespath from 'jmespath';

const NO_ARITHMETIC = 'JMESPath has no arithmetic: nothing multiplies qty by unitCents or adds shipping to a sum.';

export default {
  id: 'jmespath',
  name: 'JMESPath (jmespath.js)',
  package: 'jmespath',
  transform: 'string',
  usesEval: false,
  prepared: false,
  notes: 'The original jmespath.js. Its one documented call is search(data, expression), which parses on every call; compile() is exported but nothing public runs what it returns, so there is no prepared form.',
  prepare: (source) => source,
  run: (source, input) => jmespath.search(input, source),
  oneShot: (source, input) => jmespath.search(input, source),

  tasks: {
    project: { source: '{id: id, name: customer.name, email: customer.email, city: customer.address.city}' },

    reshape: {
      source: `{
  order: {id: id, status: status},
  buyer: {name: customer.name, location: {city: customer.address.city, country: customer.address.country}},
  lines: items[*].{sku: sku, qty: qty}
}`,
    },

    strings: { notExpressible: 'JMESPath has no function that changes the case of a string.' },

    conditional: {
      source: `{
  id: id,
  service: (customer.tier == 'gold' && 'priority') || (customer.tier == 'silver' && 'standard') || 'basic',
  next: (status == 'paid' && ((shippingCents == \`0\` && 'ship-free') || 'ship')) || (status == 'pending' && 'hold') || 'closed'
}`,
    },

    defaults: { source: "{id: id, currency: 'EUR', gift: `false`, notes: not_null(notes, ''), coupon: not_null(couponCode, 'NONE')}" },

    dates: { notExpressible: 'JMESPath has no date functions and no arithmetic, and a string cannot be sliced.' },

    rule: { source: "status == 'paid' && (customer.tier == 'gold' || shippingCents >= `1000`) && length(items[?qty >= `3`]) > `0`" },

    totals: { notExpressible: NO_ARITHMETIC },

    top: { source: "reverse(sort_by(orders[?status == 'paid' && customer.tier == 'gold'], &placedAt))[:10].{id: id, placedAt: placedAt}" },

    groups: { notExpressible: 'JMESPath has no grouping function, and no way to build an object whose keys come from the data.' },

    screen: { notExpressible: NO_ARITHMETIC },
  },
};
