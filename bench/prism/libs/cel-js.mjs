import { evaluate, parse } from '@marcbachmann/cel-js';

// CEL has no aggregation over a list (no sum, no fold) and this package has no list sorting or slicing.
const NO_SUM = 'CEL has no sum or fold over a list: its macros are all, exists, exists_one, map and filter.';

// The whole days come back as a CEL int, which this package hands over as a BigInt.
const withNumberAgeDays = (answer) => ({ ...answer, ageDays: Number(answer.ageDays) });

// CEL can ask whether a field of a value is there (has(order.notes)), not whether a variable is.
const asOrder = (input) => ({ order: input });

export default {
  id: 'cel-js',
  name: 'CEL (@marcbachmann/cel-js)',
  package: '@marcbachmann/cel-js',
  transform: 'string',
  usesEval: false,
  prepared: true,
  notes:
    "prepare is parse, which returns a function; run calls it with the input as the variables. The package's parse and evaluate at their defaults: a map literal must have values of one type, so where they differ they are written dyn(…). Numbers from JSON are CEL doubles; a CEL int comes back as a BigInt.",
  prepare: (source) => parse(source),
  run: (expression, input) => expression(input),
  oneShot: (source, input) => evaluate(source, input),
  tasks: {
    project: { source: '{"id": id, "name": customer.name, "email": customer.email, "city": customer.address.city}' },

    reshape: {
      source:
        '{"order": dyn({"id": id, "status": status}), "buyer": dyn({"name": customer.name, "location": dyn({"city": customer.address.city, "country": customer.address.country})}), "lines": dyn(items.map(item, {"sku": item.sku, "qty": item.qty}))}',
    },

    strings: {
      source:
        '{"contact": customer.name + " <" + customer.email + ">", "skus": items.map(item, item.sku).join(", "), "city": customer.address.city.upperAscii()}',
    },

    conditional: {
      source:
        '{"id": id, "service": dyn(customer.tier == "gold" ? "priority" : customer.tier == "silver" ? "standard" : "basic"), "next": dyn(status == "paid" ? (shippingCents == 0 ? "ship-free" : "ship") : status == "pending" ? "hold" : "closed")}',
    },

    defaults: {
      source:
        '{"id": order.id, "currency": dyn("EUR"), "gift": dyn(false), "notes": has(order.notes) ? order.notes : "", "coupon": order.couponCode != null ? order.couponCode : "NONE"}',
      run: (expression, input) => expression(asOrder(input)),
      oneShot: (source, input) => evaluate(source, asOrder(input)),
      glue: 'The order is handed over as the variable `order`, not as the variables themselves: has() tests a field of a value, and a variable that is not there is an error.',
    },

    dates: {
      source: '{"id": id, "day": dyn(placedAt.substring(0, 10)), "ageDays": dyn((timestamp(now) - timestamp(placedAt)).getHours() / 24)}',
      run: (expression, input) => withNumberAgeDays(expression(input)),
      oneShot: (source, input) => withNumberAgeDays(evaluate(source, input)),
      glue: 'ageDays is a CEL int, which the package returns as a BigInt: it is converted to a number.',
    },

    rule: { source: 'status == "paid" && (customer.tier == "gold" || shippingCents >= 1000) && items.exists(item, item.qty >= 3)' },

    totals: { notExpressible: `${NO_SUM} The lines of an order cannot be added up.` },

    top: { notExpressible: 'CEL has no sorting, and this package has no list sort or slice function either (cel-go has them as an extension).' },

    groups: { notExpressible: `${NO_SUM} The shipping of a country cannot be added up, and there is no grouping.` },

    screen: { notExpressible: `${NO_SUM} The revenue cannot be added up, and a list cannot be sorted.` },
  },
};
