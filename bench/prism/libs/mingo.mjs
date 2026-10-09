// Each task as a MongoDB aggregation pipeline, run by mingo. The default entry point registers every operator.
// Options are the defaults: processingMode CLONE_OFF (nothing is cloned; no stage used here writes to its input).

import { Aggregator, aggregate } from 'mingo';

// An order's lines as qty × unitCents, summed, plus its shipping.
const totalCents = { $add: [{ $sum: { $map: { input: '$items', as: 'item', in: { $multiply: ['$$item.qty', '$$item.unitCents'] } } } }, '$shippingCents'] };

// The skus of an order joined with ", ". The pipeline language has no join: $reduce with $concat is how it is written.
const skus = {
  $reduce: {
    input: '$items.sku',
    initialValue: '',
    in: { $concat: ['$$value', { $cond: [{ $eq: ['$$value', ''] }, '', ', '] }, '$$this'] },
  },
};

// A pipeline takes a collection and answers a collection. What the shape forces, and nothing else:
// one order goes in as a list of one, and the one document that comes out is the answer.
const record = {
  run: (aggregator, order) => aggregator.run([order])[0],
  oneShot: (pipeline, order) => aggregate([order], pipeline)[0],
  glue: 'The order is wrapped in a one-element list and the one resulting document is unwrapped.',
};
// The orders are the collection; the answer is the list of documents.
const list = {
  run: (aggregator, input) => aggregator.run(input.orders),
  oneShot: (pipeline, input) => aggregate(input.orders, pipeline),
  glue: 'input.orders is handed over as the collection.',
};
// The orders are the collection; the pipeline ends in one document, which is the answer.
const single = {
  run: (aggregator, input) => aggregator.run(input.orders)[0],
  oneShot: (pipeline, input) => aggregate(input.orders, pipeline)[0],
  glue: 'input.orders is handed over as the collection and the one resulting document is unwrapped.',
};

export default {
  id: 'mingo',
  name: 'mingo (aggregation pipeline)',
  package: 'mingo',
  transform: 'json',
  usesEval: false,
  prepared: true,
  notes:
    'MongoDB aggregation pipelines over in-memory arrays. prepare is new Aggregator(pipeline), which keeps the pipeline and checks nothing until it runs; run is .run(collection). Default options (no cloning of inputs or outputs); all operators registered by the default entry point.',
  prepare: (pipeline) => new Aggregator(pipeline),
  run: (aggregator, collection) => aggregator.run(collection),
  oneShot: (pipeline, collection) => aggregate(collection, pipeline),

  tasks: {
    project: {
      source: [{ $project: { _id: 0, id: '$id', name: '$customer.name', email: '$customer.email', city: '$customer.address.city' } }],
      ...record,
    },

    reshape: {
      source: [
        {
          $project: {
            _id: 0,
            order: { id: '$id', status: '$status' },
            buyer: { name: '$customer.name', location: { city: '$customer.address.city', country: '$customer.address.country' } },
            lines: { $map: { input: '$items', as: 'item', in: { sku: '$$item.sku', qty: '$$item.qty' } } },
          },
        },
      ],
      ...record,
    },

    strings: {
      source: [
        {
          $project: {
            _id: 0,
            contact: { $concat: ['$customer.name', ' <', '$customer.email', '>'] },
            skus,
            city: { $toUpper: '$customer.address.city' },
          },
        },
      ],
      ...record,
    },

    conditional: {
      source: [
        {
          $project: {
            _id: 0,
            id: '$id',
            service: {
              $switch: {
                branches: [
                  { case: { $eq: ['$customer.tier', 'gold'] }, then: 'priority' },
                  { case: { $eq: ['$customer.tier', 'silver'] }, then: 'standard' },
                ],
                default: 'basic',
              },
            },
            next: {
              $switch: {
                branches: [
                  { case: { $eq: ['$status', 'paid'] }, then: { $cond: [{ $eq: ['$shippingCents', 0] }, 'ship-free', 'ship'] } },
                  { case: { $eq: ['$status', 'pending'] }, then: 'hold' },
                ],
                default: 'closed',
              },
            },
          },
        },
      ],
      ...record,
    },

    defaults: {
      source: [
        {
          $project: {
            _id: 0,
            id: '$id',
            currency: { $literal: 'EUR' },
            gift: { $literal: false },
            notes: { $ifNull: ['$notes', ''] },
            coupon: { $ifNull: ['$couponCode', 'NONE'] },
          },
        },
      ],
      ...record,
    },

    dates: {
      source: [
        {
          $project: {
            _id: 0,
            id: '$id',
            day: { $dateToString: { date: { $toDate: '$placedAt' }, format: '%Y-%m-%d' } },
            ageDays: { $floor: { $divide: [{ $subtract: [{ $toDate: '$now' }, { $toDate: '$placedAt' }] }, 86400000] } },
          },
        },
      ],
      ...record,
    },

    rule: {
      source: [
        {
          $project: {
            _id: 0,
            answer: {
              $and: [
                { $eq: ['$status', 'paid'] },
                { $or: [{ $eq: ['$customer.tier', 'gold'] }, { $gte: ['$shippingCents', 1000] }] },
                { $anyElementTrue: { $map: { input: '$items', as: 'item', in: { $gte: ['$$item.qty', 3] } } } },
              ],
            },
          },
        },
      ],
      run: (aggregator, order) => aggregator.run([order])[0].answer,
      oneShot: (pipeline, order) => aggregate([order], pipeline)[0].answer,
      glue: 'The order is wrapped in a one-element list; a pipeline answers documents, so the boolean is the one field of the one resulting document.',
    },

    totals: {
      source: [{ $project: { _id: 0, id: '$id', totalCents, units: { $sum: '$items.qty' } } }],
      ...list,
    },

    top: {
      source: [{ $match: { status: 'paid', 'customer.tier': 'gold' } }, { $sort: { placedAt: -1 } }, { $limit: 10 }, { $project: { _id: 0, id: '$id', placedAt: '$placedAt' } }],
      ...list,
    },

    // $facet answers one document whatever comes in, so no orders gives {} and not nothing.
    groups: {
      source: [
        {
          $facet: {
            countries: [
              { $group: { _id: '$customer.address.country', orders: { $sum: 1 }, shippingCents: { $sum: '$shippingCents' } } },
              { $project: { _id: 0, k: '$_id', v: { orders: '$orders', shippingCents: '$shippingCents' } } },
            ],
          },
        },
        { $replaceWith: { $arrayToObject: '$countries' } },
      ],
      ...single,
    },

    screen: {
      source: [
        { $match: { status: 'paid' } },
        {
          $facet: {
            summary: [{ $group: { _id: null, count: { $sum: 1 }, revenueCents: { $sum: totalCents } } }],
            rows: [
              { $sort: { placedAt: -1 } },
              { $limit: 20 },
              { $project: { _id: 0, id: '$id', buyer: '$customer.name', city: '$customer.address.city', totalCents, skus } },
            ],
          },
        },
        {
          $project: {
            count: { $ifNull: [{ $first: '$summary.count' }, 0] },
            revenueCents: { $ifNull: [{ $first: '$summary.revenueCents' }, 0] },
            rows: 1,
          },
        },
      ],
      ...single,
    },
  },
};
