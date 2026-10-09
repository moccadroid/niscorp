// The eleven tasks as Prism configs. Shared by the Prism rows (this build and the published one), which differ
// only in which build runs them and through which entry point.

const ref = (path) => ({ $ref: path });
const of = (name, ...path) => ({ $get: { from: { $var: name }, path } });

// qty × unitCents over an order's lines, plus its shipping. `order` is a node that answers the order.
const totalOf = (order) => ({
  $add: [
    { $sum: { over: { $map: { over: { $get: { from: order, path: ['items'] } }, as: 'item', body: { $mul: [of('item', 'qty'), of('item', 'unitCents')] } } } } },
    { $get: { from: order, path: ['shippingCents'] } },
  ],
});

const skusOf = (order) => ({ $join: { parts: { $pluck: { over: { $get: { from: order, path: ['items'] } }, key: 'sku' } }, sep: ', ' } });

const paid = { $filter: { over: ref('$.orders'), as: 'order', when: { $eq: [of('order', 'status'), 'paid'] } } };

export const CONFIGS = {
  project: { id: ref('$.id'), name: ref('$.customer.name'), email: ref('$.customer.email'), city: ref('$.customer.address.city') },

  reshape: {
    order: { id: ref('$.id'), status: ref('$.status') },
    buyer: { name: ref('$.customer.name'), location: { city: ref('$.customer.address.city'), country: ref('$.customer.address.country') } },
    lines: { $map: { over: ref('$.items'), as: 'item', body: { sku: of('item', 'sku'), qty: of('item', 'qty') } } },
  },

  strings: {
    contact: { $interpolate: { template: '{{name}} <{{email}}>', values: { name: ref('$.customer.name'), email: ref('$.customer.email') } } },
    skus: skusOf(ref('$')),
    city: { $upper: ref('$.customer.address.city') },
  },

  conditional: {
    id: ref('$.id'),
    service: {
      $case: {
        branches: [
          { when: { $eq: [ref('$.customer.tier'), 'gold'] }, then: 'priority' },
          { when: { $eq: [ref('$.customer.tier'), 'silver'] }, then: 'standard' },
        ],
        else: 'basic',
      },
    },
    next: {
      $case: {
        branches: [
          { when: { $eq: [ref('$.status'), 'paid'] }, then: { $case: { branches: [{ when: { $eq: [ref('$.shippingCents'), 0] }, then: 'ship-free' }], else: 'ship' } } },
          { when: { $eq: [ref('$.status'), 'pending'] }, then: 'hold' },
        ],
        else: 'closed',
      },
    },
  },

  defaults: {
    id: ref('$.id'),
    currency: 'EUR',
    gift: false,
    notes: { $get: { from: ref('$'), path: ['notes'], fallback: '' } },
    coupon: { $coalesce: [ref('$.couponCode'), 'NONE'] },
  },

  dates: {
    id: ref('$.id'),
    day: { $date: { value: ref('$.placedAt'), format: 'YYYY-MM-DD', utc: true } },
    ageDays: { $dateDiff: { from: ref('$.placedAt'), to: ref('$.now'), unit: 'day' } },
  },

  rule: {
    $and: [
      { $eq: [ref('$.status'), 'paid'] },
      { $or: [{ $eq: [ref('$.customer.tier'), 'gold'] }, { $gte: [ref('$.shippingCents'), 1000] }] },
      { $not: { $empty: { $filter: { over: ref('$.items'), as: 'item', when: { $gte: [of('item', 'qty'), 3] } } } } },
    ],
  },

  totals: {
    $map: {
      over: ref('$.orders'),
      as: 'order',
      body: { id: of('order', 'id'), totalCents: totalOf({ $var: 'order' }), units: { $sum: { over: { $pluck: { over: of('order', 'items'), key: 'qty' } } } } },
    },
  },

  top: {
    $map: {
      over: {
        $take: {
          from: {
            $sortBy: {
              over: {
                $filter: { over: ref('$.orders'), as: 'order', when: { $and: [{ $eq: [of('order', 'status'), 'paid'] }, { $eq: [of('order', 'customer', 'tier'), 'gold'] }] } },
              },
              as: 'order',
              by: of('order', 'placedAt'),
              dir: 'desc',
            },
          },
          count: 10,
        },
      },
      as: 'order',
      body: { id: of('order', 'id'), placedAt: of('order', 'placedAt') },
    },
  },

  groups: {
    $fromEntries: {
      $map: {
        over: { $entriesOf: { $groupBy: { over: ref('$.orders'), as: 'order', key: of('order', 'customer', 'address', 'country') } } },
        as: 'entry',
        body: [of('entry', 0), { orders: { $length: of('entry', 1) }, shippingCents: { $sum: { over: { $pluck: { over: of('entry', 1), key: 'shippingCents' } } } } }],
      },
    },
  },

  screen: {
    $with: {
      let: { paid },
      value: {
        count: { $length: { $var: 'paid' } },
        revenueCents: { $sum: { over: { $map: { over: { $var: 'paid' }, as: 'order', body: totalOf({ $var: 'order' }) } } } },
        rows: {
          $map: {
            over: { $take: { from: { $sortBy: { over: { $var: 'paid' }, as: 'order', by: of('order', 'placedAt'), dir: 'desc' } }, count: 20 } },
            as: 'order',
            body: { id: of('order', 'id'), buyer: of('order', 'customer', 'name'), city: of('order', 'customer', 'address', 'city'), totalCents: totalOf({ $var: 'order' }), skus: skusOf({ $var: 'order' }) },
          },
        },
      },
    },
  },
};

// The rows of one Prism build: `lib` is that build's main entry.
export const rowsOf = (lib) => ({
  // compile once, execute after: the form a host keeps.
  compiled: { prepare: (config) => lib.compile(config), run: (ir, input) => lib.execute(ir, input), oneShot: (config, input) => lib.evaluate(config, input) },
  // evaluate, as a host calls it: the same config object again (run), and a new object each call (oneShot). The
  // published 0.2.2 had this as prismTransform.
  transform: { prepareTimed: false, prepare: (config) => config, run: (config, input) => (lib.prismTransform ?? lib.evaluate)(config, input), oneShot: (config, input) => (lib.prismTransform ?? lib.evaluate)(config, input) },
});

export const tasksOf = () => Object.fromEntries(Object.entries(CONFIGS).map(([id, source]) => [id, { source }]));
