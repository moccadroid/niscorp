import { loadJq } from 'jq-wasm';

// The WASM module is loaded once, here; the calls after it are synchronous.
const jq = await loadJq();

// One call: the input goes in as JSON text, the filter is compiled, jq runs, its first output comes back parsed.
const call = (filter, input) => jq.first(input, filter);

// qty × unitCents over an order's lines, plus its shipping.
const TOTAL = 'def total: (.items | map(.qty * .unitCents) | add) + .shippingCents;';

export default {
  id: 'jq-wasm',
  name: 'jq (jq-wasm)',
  package: 'jq-wasm',
  transform: 'string',
  usesEval: false,
  prepared: false,
  notes:
    'jq 1.8.2 compiled to WebAssembly. No prepared form: the public API takes the filter as text on every call and compiles it inside jq. Every call crosses the WASM boundary with JSON text: the input is stringified going in and the output parsed coming out. The module is loaded once before anything is timed; jq.first hands back the first output of the filter.',
  prepare: (source) => source,
  run: call,
  oneShot: call,
  tasks: {
    project: { source: '{id, name: .customer.name, email: .customer.email, city: .customer.address.city}' },

    reshape: {
      source:
        '{order: {id, status}, buyer: {name: .customer.name, location: (.customer.address | {city, country})}, lines: [.items[] | {sku, qty}]}',
    },

    strings: {
      source:
        '{contact: "\\(.customer.name) <\\(.customer.email)>", skus: (.items | map(.sku) | join(", ")), city: (.customer.address.city | ascii_upcase)}',
    },

    conditional: {
      source:
        '{id, service: (if .customer.tier == "gold" then "priority" elif .customer.tier == "silver" then "standard" else "basic" end), next: (if .status == "paid" then (if .shippingCents == 0 then "ship-free" else "ship" end) elif .status == "pending" then "hold" else "closed" end)}',
    },

    defaults: { source: '{id, currency: "EUR", gift: false, notes: (.notes // ""), coupon: (.couponCode // "NONE")}' },

    dates: {
      source:
        '{id, day: (.placedAt | fromdate | strftime("%Y-%m-%d")), ageDays: (((.now | fromdate) - (.placedAt | fromdate)) / 86400 | floor)}',
    },

    rule: { source: '.status == "paid" and (.customer.tier == "gold" or .shippingCents >= 1000) and any(.items[]; .qty >= 3)' },

    totals: { source: `${TOTAL} [.orders[] | {id, totalCents: total, units: (.items | map(.qty) | add)}]` },

    top: {
      source:
        '[.orders[] | select(.status == "paid" and .customer.tier == "gold")] | sort_by(.placedAt) | reverse | .[:10] | map({id, placedAt})',
    },

    groups: {
      source:
        '.orders | group_by(.customer.address.country) | map({key: .[0].customer.address.country, value: {orders: length, shippingCents: (map(.shippingCents) | add)}}) | from_entries',
    },

    screen: {
      source: `${TOTAL} [.orders[] | select(.status == "paid")] as $paid | {count: ($paid | length), revenueCents: ($paid | map(total) | add // 0), rows: ($paid | sort_by(.placedAt) | reverse | .[:20] | map({id, buyer: .customer.name, city: .customer.address.city, totalCents: total, skus: (.items | map(.sku) | join(", "))}))}`,
    },
  },
};
