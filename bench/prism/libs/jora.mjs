import jora from 'jora';

export default {
  id: 'jora',
  name: 'Jora',
  package: 'jora',
  transform: 'string',
  usesEval: true,
  prepared: true,
  notes:
    'prepare is jora(query), which turns the query into JavaScript text and compiles it with new Function; run calls that function. At its defaults jora keeps every compiled query in a map inside the package, keyed by the query text: only the first prepare or one shot of a query in a process compiles, the later ones find it there.',
  prepare: (source) => jora(source),
  run: (query, input) => query(input),
  oneShot: (source, input) => jora(source)(input),
  tasks: {
    project: { source: '{ id, name: customer.name, email: customer.email, city: customer.address.city }' },

    reshape: {
      source:
        '{ order: { id, status }, buyer: { name: customer.name, location: { city: customer.address.city, country: customer.address.country } }, lines: items.({ sku, qty }) }',
    },

    strings: {
      source: '{ contact: `${customer.name} <${customer.email}>`, skus: items.(sku).join(", "), city: customer.address.city.toUpperCase() }',
    },

    conditional: {
      source:
        '{ id, service: customer.tier = "gold" ? "priority" : customer.tier = "silver" ? "standard" : "basic", next: status = "paid" ? (shippingCents = 0 ? "ship-free" : "ship") : status = "pending" ? "hold" : "closed" }',
    },

    defaults: { source: '{ id, currency: "EUR", gift: false, notes: notes ?? "", coupon: couponCode ?? "NONE" }' },

    dates: { notExpressible: 'Jora has no date parsing and no date arithmetic: the whole days between two ISO times cannot be counted.' },

    rule: { source: 'status = "paid" and (customer.tier = "gold" or shippingCents >= 1000) and items.[qty >= 3].size() > 0' },

    totals: { source: 'orders.({ id, totalCents: items.sum(=> qty * unitCents) + shippingCents, units: items.sum(=> qty) })' },

    top: { source: 'orders.[status = "paid" and customer.tier = "gold"].sort(placedAt desc)[0:10].({ id, placedAt })' },

    groups: {
      source:
        'orders.group(=> customer.address.country).({ key, value: { orders: value.size(), shippingCents: value.sum(=> shippingCents) } }).fromEntries()',
    },

    screen: {
      source:
        '$paid: orders.[status = "paid"]; $total: => items.sum(=> qty * unitCents) + shippingCents; { count: $paid.size(), revenueCents: $paid.sum($total) ?? 0, rows: $paid.sort(placedAt desc)[0:20].({ id, buyer: customer.name, city: customer.address.city, totalCents: $total(), skus: items.(sku).join(", ") }) }',
    },
  },
};
