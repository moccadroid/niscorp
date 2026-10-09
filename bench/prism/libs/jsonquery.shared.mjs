// The tasks as JSON Query queries, each written twice: in the text format and in the JSON format. The two say the
// same thing: parse(TEXT[id]) is JSON[id], value for value. Built-in functions only.

// What the language has no way to say. The same for both formats.
export const NOT_EXPRESSIBLE = {
  strings: 'No built-in function changes the case of a string, so the upper-cased city cannot be written (the interpolated string and the joined list can).',
  dates: 'No date functions: a timestamp cannot be parsed or subtracted, so the whole days until `now` cannot be written (the day itself is a substring).',
};

export const TEXT = {
  project: '{ id: .id, name: .customer.name, email: .customer.email, city: .customer.address.city }',

  reshape: `{
  order: { id: .id, status: .status },
  buyer: {
    name: .customer.name,
    location: { city: .customer.address.city, country: .customer.address.country }
  },
  lines: .items | pick(.sku, .qty)
}`,

  conditional: `{
  id: .id,
  service: if(.customer.tier == "gold", "priority", if(.customer.tier == "silver", "standard", "basic")),
  next: if(
    .status == "paid",
    if(.shippingCents == 0, "ship-free", "ship"),
    if(.status == "pending", "hold", "closed")
  )
}`,

  defaults: `{
  id: .id,
  currency: "EUR",
  gift: false,
  notes: if(exists(.notes), .notes, ""),
  coupon: if(.couponCode == null, "NONE", .couponCode)
}`,

  rule: `.status == "paid"
  and (.customer.tier == "gold" or .shippingCents >= 1000)
  and (.items | filter(.qty >= 3) | size()) > 0`,

  totals: `.orders | map({
  id: .id,
  totalCents: (.items | map(.qty * .unitCents) | sum()) + .shippingCents,
  units: .items | map(.qty) | sum()
})`,

  top: `.orders
  | filter(.status == "paid" and .customer.tier == "gold")
  | sort(.placedAt, "desc")
  | limit(10)
  | pick(.id, .placedAt)`,

  groups: `.orders
  | groupBy(.customer.address.country)
  | mapValues({ orders: size(), shippingCents: map(.shippingCents) | sum() })`,

  screen: `.orders
  | filter(.status == "paid")
  | {
    count: size(),
    revenueCents: map((.items | map(.qty * .unitCents) | sum()) + .shippingCents) | sum(),
    rows: sort(.placedAt, "desc") | limit(20) | map({
      id: .id,
      buyer: .customer.name,
      city: .customer.address.city,
      totalCents: (.items | map(.qty * .unitCents) | sum()) + .shippingCents,
      skus: .items | map(.sku) | join(", ")
    })
  }`,
};

const get = (...path) => ['get', ...path];
const eq = (a, b) => ['eq', a, b];

// (.items | map(.qty * .unitCents) | sum()) + .shippingCents, in the order it is piped into.
const totalCents = ['add', ['pipe', get('items'), ['map', ['multiply', get('qty'), get('unitCents')]], ['sum']], get('shippingCents')];

export const JSON_QUERIES = {
  project: ['object', { id: get('id'), name: get('customer', 'name'), email: get('customer', 'email'), city: get('customer', 'address', 'city') }],

  reshape: [
    'object',
    {
      order: ['object', { id: get('id'), status: get('status') }],
      buyer: [
        'object',
        { name: get('customer', 'name'), location: ['object', { city: get('customer', 'address', 'city'), country: get('customer', 'address', 'country') }] },
      ],
      lines: ['pipe', get('items'), ['pick', get('sku'), get('qty')]],
    },
  ],

  conditional: [
    'object',
    {
      id: get('id'),
      service: ['if', eq(get('customer', 'tier'), 'gold'), 'priority', ['if', eq(get('customer', 'tier'), 'silver'), 'standard', 'basic']],
      next: ['if', eq(get('status'), 'paid'), ['if', eq(get('shippingCents'), 0), 'ship-free', 'ship'], ['if', eq(get('status'), 'pending'), 'hold', 'closed']],
    },
  ],

  defaults: [
    'object',
    {
      id: get('id'),
      currency: 'EUR',
      gift: false,
      notes: ['if', ['exists', get('notes')], get('notes'), ''],
      coupon: ['if', eq(get('couponCode'), null), 'NONE', get('couponCode')],
    },
  ],

  rule: [
    'and',
    eq(get('status'), 'paid'),
    ['or', eq(get('customer', 'tier'), 'gold'), ['gte', get('shippingCents'), 1000]],
    ['gt', ['pipe', get('items'), ['filter', ['gte', get('qty'), 3]], ['size']], 0],
  ],

  totals: ['pipe', get('orders'), ['map', ['object', { id: get('id'), totalCents, units: ['pipe', get('items'), ['map', get('qty')], ['sum']] }]]],

  top: [
    'pipe',
    get('orders'),
    ['filter', ['and', eq(get('status'), 'paid'), eq(get('customer', 'tier'), 'gold')]],
    ['sort', get('placedAt'), 'desc'],
    ['limit', 10],
    ['pick', get('id'), get('placedAt')],
  ],

  groups: [
    'pipe',
    get('orders'),
    ['groupBy', get('customer', 'address', 'country')],
    ['mapValues', ['object', { orders: ['size'], shippingCents: ['pipe', ['map', get('shippingCents')], ['sum']] }]],
  ],

  screen: [
    'pipe',
    get('orders'),
    ['filter', eq(get('status'), 'paid')],
    [
      'object',
      {
        count: ['size'],
        revenueCents: ['pipe', ['map', totalCents], ['sum']],
        rows: [
          'pipe',
          ['sort', get('placedAt'), 'desc'],
          ['limit', 20],
          [
            'map',
            [
              'object',
              {
                id: get('id'),
                buyer: get('customer', 'name'),
                city: get('customer', 'address', 'city'),
                totalCents,
                skus: ['pipe', get('items'), ['map', get('sku')], ['join', ', ']],
              },
            ],
          ],
        ],
      },
    ],
  ],
};

// One row's tasks: its sources, and the same two gaps.
export const tasksOf = (sources) => ({
  ...Object.fromEntries(Object.entries(sources).map(([id, source]) => [id, { source }])),
  ...Object.fromEntries(Object.entries(NOT_EXPRESSIBLE).map(([id, why]) => [id, { notExpressible: why }])),
});
