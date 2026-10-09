import jsone from 'json-e';

const ev = (expression) => ({ $eval: expression });

// The orders in scope that `when` holds for: $map drops what an $if without an else leaves out.
const where = (when) => ({ $map: ev('orders'), 'each(order)': { $if: when, then: ev('order') } });

// The first `count` of `orders`, newest first. $sort is ascending only, so it is reversed.
const newest = (orders, count, row) => ({
  $let: { sorted: { $reverse: { $sort: orders, 'by(order)': 'order.placedAt' } } },
  in: { $map: ev(`sorted[0:${count}]`), 'each(order)': row },
});

// qty × unitCents over the lines of `order`.
const linesCents = { $reduce: ev('order.items'), initial: 0, 'each(sum, item)': ev('sum + item.qty * item.unitCents') };

export default {
  id: 'json-e',
  name: 'JSON-e',
  package: 'json-e',
  transform: 'json',
  usesEval: false,
  prepared: false,
  notes: 'No prepared form: jsone(template, context) walks the template and parses every expression string in it on every call, once for each element inside $map, $reduce and $sort. It keeps nothing between calls.',
  prepare: (template) => template,
  run: (template, input) => jsone(template, input),
  oneShot: (template, input) => jsone(template, input),

  tasks: {
    project: { source: { id: ev('id'), name: ev('customer.name'), email: ev('customer.email'), city: ev('customer.address.city') } },

    reshape: {
      source: {
        order: { id: ev('id'), status: ev('status') },
        buyer: { name: ev('customer.name'), location: { city: ev('customer.address.city'), country: ev('customer.address.country') } },
        lines: { $map: ev('items'), 'each(item)': { sku: ev('item.sku'), qty: ev('item.qty') } },
      },
    },

    strings: {
      source: {
        contact: '${customer.name} <${customer.email}>',
        skus: { $let: { skus: { $map: ev('items'), 'each(item)': ev('item.sku') } }, in: ev("join(skus, ', ')") },
        city: ev('uppercase(customer.address.city)'),
      },
    },

    conditional: {
      source: {
        id: ev('id'),
        service: { $switch: { "customer.tier == 'gold'": 'priority', "customer.tier == 'silver'": 'standard', $default: 'basic' } },
        next: {
          $if: "status == 'paid'",
          then: { $if: 'shippingCents == 0', then: 'ship-free', else: 'ship' },
          else: { $if: "status == 'pending'", then: 'hold', else: 'closed' },
        },
      },
    },

    defaults: {
      source: {
        id: ev('id'),
        currency: 'EUR',
        gift: false,
        notes: { $if: "defined('notes')", then: ev('notes'), else: '' },
        coupon: { $if: 'couponCode == null', then: 'NONE', else: ev('couponCode') },
      },
    },

    dates: { notExpressible: 'No date parsing and no difference between two dates: the only date feature is $fromNow, which makes a timestamp from an offset.' },

    rule: {
      source: {
        $let: { large: { $map: ev('items'), 'each(item)': { $if: 'item.qty >= 3', then: ev('item') } } },
        in: ev("status == 'paid' && (customer.tier == 'gold' || shippingCents >= 1000) && len(large) > 0"),
      },
    },

    totals: {
      source: {
        $map: ev('orders'),
        'each(order)': {
          id: ev('order.id'),
          totalCents: { $let: { lines: linesCents }, in: ev('lines + order.shippingCents') },
          units: { $reduce: ev('order.items'), initial: 0, 'each(sum, item)': ev('sum + item.qty') },
        },
      },
    },

    top: {
      source: newest(where("order.status == 'paid' && order.customer.tier == 'gold'"), 10, { id: ev('order.id'), placedAt: ev('order.placedAt') }),
    },

    groups: {
      source: {
        $reduce: ev('orders'),
        initial: {},
        'each(groups, order)': {
          $let: { country: ev('order.customer.address.country') },
          in: {
            $let: { group: { $if: 'country in groups', then: ev('groups[country]'), else: { orders: 0, shippingCents: 0 } } },
            in: { $merge: [ev('groups'), { '${country}': { orders: ev('group.orders + 1'), shippingCents: ev('group.shippingCents + order.shippingCents') } }] },
          },
        },
      },
    },

    screen: {
      source: {
        $let: { paid: where("order.status == 'paid'") },
        in: {
          count: ev('len(paid)'),
          revenueCents: {
            $reduce: ev('paid'),
            initial: 0,
            'each(revenue, order)': { $let: { lines: linesCents }, in: ev('revenue + lines + order.shippingCents') },
          },
          rows: newest(ev('paid'), 20, {
            id: ev('order.id'),
            buyer: ev('order.customer.name'),
            city: ev('order.customer.address.city'),
            totalCents: { $let: { lines: linesCents }, in: ev('lines + order.shippingCents') },
            skus: { $let: { skus: { $map: ev('order.items'), 'each(item)': ev('item.sku') } }, in: ev("join(skus, ', ')") },
          }),
        },
      },
    },
  },
};
