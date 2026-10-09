// The tasks as json-logic-engine rules. Shared by its two rows, which differ only in how a rule is run:
// interpreted (engine.run) or compiled (engine.build). Built-in operators only; beyond the JsonLogic spec these
// use `eachKey` (an object from fixed keys) and `??`.

const v = (path) => ({ var: path });

// qty × unitCents over the lines of the order in scope, plus its shipping.
const totalCents = {
  '+': [{ reduce: [v('items'), { '+': [v('accumulator'), { '*': [v('current.qty'), v('current.unitCents')] }] }, 0] }, v('shippingCents')],
};

export const RULES = {
  project: { eachKey: { id: v('id'), name: v('customer.name'), email: v('customer.email'), city: v('customer.address.city') } },

  reshape: {
    eachKey: {
      order: { eachKey: { id: v('id'), status: v('status') } },
      buyer: { eachKey: { name: v('customer.name'), location: { eachKey: { city: v('customer.address.city'), country: v('customer.address.country') } } } },
      lines: { map: [v('items'), { eachKey: { sku: v('sku'), qty: v('qty') } }] },
    },
  },

  conditional: {
    eachKey: {
      id: v('id'),
      service: { if: [{ '==': [v('customer.tier'), 'gold'] }, 'priority', { '==': [v('customer.tier'), 'silver'] }, 'standard', 'basic'] },
      next: {
        if: [
          { '==': [v('status'), 'paid'] },
          { if: [{ '==': [v('shippingCents'), 0] }, 'ship-free', 'ship'] },
          { '==': [v('status'), 'pending'] },
          'hold',
          'closed',
        ],
      },
    },
  },

  defaults: {
    eachKey: { id: v('id'), currency: 'EUR', gift: false, notes: { '??': [v('notes'), ''] }, coupon: { '??': [v('couponCode'), 'NONE'] } },
  },

  rule: {
    and: [
      { '==': [v('status'), 'paid'] },
      { or: [{ '==': [v('customer.tier'), 'gold'] }, { '>=': [v('shippingCents'), 1000] }] },
      { some: [v('items'), { '>=': [v('qty'), 3] }] },
    ],
  },

  totals: {
    map: [v('orders'), { eachKey: { id: v('id'), totalCents, units: { reduce: [v('items'), { '+': [v('accumulator'), v('current.qty')] }, 0] } } }],
  },
};

const NOT = {
  strings: 'No operator changes the case of a string.',
  dates: 'No operator parses a date or measures the time between two.',
  top: 'No operator sorts a list, and none takes its first n.',
  groups: 'No operator groups a list, and none builds an object whose keys come from the data (eachKey takes fixed keys).',
  screen: 'No operator sorts a list, and none takes its first n.',
};

export const tasksOf = () => ({
  ...Object.fromEntries(Object.entries(RULES).map(([id, source]) => [id, { source }])),
  ...Object.fromEntries(Object.entries(NOT).map(([id, notExpressible]) => [id, { notExpressible }])),
});
