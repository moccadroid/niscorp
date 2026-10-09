import jsonata from 'jsonata';

// qty × unitCents over the lines of the order in context, plus its shipping.
const TOTAL = '$sum(items.(qty * unitCents)) + shippingCents';

export default {
  id: 'jsonata',
  name: 'JSONata',
  package: 'jsonata',
  transform: 'string',
  usesEval: false,
  prepared: true,
  notes: 'Asynchronous: evaluate returns a promise, and it is measured so. prepare is jsonata(source), which parses; run is evaluate on what it returned. groups carries one extra step (orders.$ in place of orders) because 2.2.2 writes into an empty input list when it groups.',
  prepare: (source) => jsonata(source),
  run: (prepared, input) => prepared.evaluate(input),
  oneShot: (source, input) => jsonata(source).evaluate(input),

  tasks: {
    project: { source: '{ "id": id, "name": customer.name, "email": customer.email, "city": customer.address.city }' },

    reshape: {
      source: `{
  "order": { "id": id, "status": status },
  "buyer": { "name": customer.name, "location": { "city": customer.address.city, "country": customer.address.country } },
  "lines": [items.{ "sku": sku, "qty": qty }]
}`,
    },

    strings: {
      source: `{
  "contact": customer.name & " <" & customer.email & ">",
  "skus": $join(items.sku, ", "),
  "city": $uppercase(customer.address.city)
}`,
    },

    conditional: {
      source: `{
  "id": id,
  "service": customer.tier = "gold" ? "priority" : customer.tier = "silver" ? "standard" : "basic",
  "next": status = "paid" ? (shippingCents = 0 ? "ship-free" : "ship") : status = "pending" ? "hold" : "closed"
}`,
    },

    defaults: { source: '{ "id": id, "currency": "EUR", "gift": false, "notes": notes ?? "", "coupon": couponCode ?: "NONE" }' },

    dates: {
      source: `{
  "id": id,
  "day": $fromMillis($toMillis(placedAt), "[Y0001]-[M01]-[D01]"),
  "ageDays": $floor(($toMillis(now) - $toMillis(placedAt)) / 86400000)
}`,
    },

    rule: { source: 'status = "paid" and (customer.tier = "gold" or shippingCents >= 1000) and $exists(items[qty >= 3])' },

    totals: { source: `[orders.{ "id": id, "totalCents": ${TOTAL}, "units": $sum(items.qty) }]` },

    top: { source: '[orders[status = "paid" and customer.tier = "gold"]^(>placedAt)[[0..9]].{ "id": id, "placedAt": placedAt }]' },

    // The usual form is orders{ … }. JSONata 2.2.2 pushes undefined into an empty input list there (evaluateGroupExpression),
    // which changes the caller's data and throws on a frozen one. The extra step .$ hands the grouping a list of its own.
    groups: { source: 'orders.$ { customer.address.country: { "orders": $count($), "shippingCents": $sum(shippingCents) } }' },

    screen: {
      source: `(
  $paid := orders[status = "paid"];
  {
    "count": $count($paid),
    "revenueCents": $sum([$paid.(${TOTAL})]),
    "rows": [$paid^(>placedAt)[[0..19]].{
      "id": id,
      "buyer": customer.name,
      "city": customer.address.city,
      "totalCents": ${TOTAL},
      "skus": $join(items.sku, ", ")
    }]
  }
)`,
    },
  },
};
