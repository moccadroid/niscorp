import { evaluate, parse } from 'groq-js';

// The input is the root of the query (`@`): its attributes are read by name. No dataset (`*`) is given.
const run = async (tree, input) => (await evaluate(tree, { root: input })).get();

// qty × unitCents over an order's lines, plus its shipping. GROQ maps to a computed value with a projection.
const TOTAL = 'math::sum(items[]{"cents": qty * unitCents}.cents) + shippingCents';

export default {
  id: 'groq-js',
  name: 'GROQ (groq-js)',
  package: 'groq-js',
  transform: 'string',
  usesEval: false,
  prepared: true,
  notes:
    'prepare is parse (a syntax tree); run is evaluate on that tree, which is asynchronous: it resolves to a value whose get() resolves to the answer. The package also exports evaluateSync, marked internal and as covering a subset of the language, so it is not used. The input is given as the root of the query, not as a dataset.',
  prepare: (source) => parse(source),
  run,
  oneShot: (source, input) => run(parse(source), input),
  tasks: {
    project: { source: '{id, "name": customer.name, "email": customer.email, "city": customer.address.city}' },

    reshape: {
      source:
        '{"order": {id, status}, "buyer": {"name": customer.name, "location": {"city": customer.address.city, "country": customer.address.country}}, "lines": items[]{sku, qty}}',
    },

    strings: {
      source:
        '{"contact": customer.name + " <" + customer.email + ">", "skus": array::join(items[].sku, ", "), "city": upper(customer.address.city)}',
    },

    conditional: {
      source:
        '{id, "service": select(customer.tier == "gold" => "priority", customer.tier == "silver" => "standard", "basic"), "next": select(status == "paid" => select(shippingCents == 0 => "ship-free", "ship"), status == "pending" => "hold", "closed")}',
    },

    defaults: { source: '{id, "currency": "EUR", "gift": false, "notes": coalesce(notes, ""), "coupon": coalesce(couponCode, "NONE")}' },

    dates: {
      source:
        '{id, "day": string::split(placedAt, "T")[0], "seconds": dateTime(now) - dateTime(placedAt)}{id, day, "ageDays": (seconds - seconds % 86400) / 86400}',
    },

    rule: { source: 'status == "paid" && (customer.tier == "gold" || shippingCents >= 1000) && count(items[qty >= 3]) > 0' },

    totals: { source: `orders[]{id, "totalCents": ${TOTAL}, "units": math::sum(items[].qty)}` },

    top: { source: 'orders[status == "paid" && customer.tier == "gold"] | order(placedAt desc)[0...10]{id, placedAt}' },

    groups: {
      notExpressible:
        'GROQ has no grouping, and an object key is always a literal string: an object keyed by the countries found in the data cannot be built.',
    },

    screen: {
      source: `{"paid": orders[status == "paid"]{..., "totalCents": ${TOTAL}}}{"count": count(paid), "revenueCents": math::sum(paid[].totalCents), "rows": paid | order(placedAt desc)[0...20]{id, "buyer": customer.name, "city": customer.address.city, totalCents, "skus": array::join(items[].sku, ", ")}}`,
    },
  },
};
