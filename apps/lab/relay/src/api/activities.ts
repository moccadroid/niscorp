import type { CacheEntry } from './index';
import { money, dateText } from '@relay/lib/format.prism';

// A deal's activity feed — `activity_id`/owner aliased; the mapping formats the
// date as `when` and derives a colour `tone` per type.
export const activitiesByDeal: CacheEntry = {
  fingerprint: 'activities/byDeal',
  intent: "A deal's recent activity (calls, emails, meetings, notes)",
  shape: [{ activity_id: '', type: '', subject: '', owner: '', when: '', tone: '' }],
  dsl: {
    from: ['activities', 'users'],
    fields: [
      { field: 'activities.id', as: 'activity_id' },
      'activities.type',
      'activities.subject',
      'activities.occurred_at',
      { field: 'users.name', as: 'owner' },
    ],
    filter: { eq: ['activities.deal_id', { $context: 'id' }] },
    sort: [{ field: 'activities.occurred_at', dir: 'desc' }],
    limit: 12,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        activity_id: { $get: { from: { $var: 'r' }, path: ['activity_id'] } },
        type: { $get: { from: { $var: 'r' }, path: ['type'] } },
        subject: { $get: { from: { $var: 'r' }, path: ['subject'] } },
        owner: { $get: { from: { $var: 'r' }, path: ['owner'] } },
        when: dateText({ $get: { from: { $var: 'r' }, path: ['occurred_at'] } }),
        tone: {
          $case: {
            branches: [
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['type'] } }, 'call'] }, then: 'green' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['type'] } }, 'email'] }, then: 'blue' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['type'] } }, 'meeting'] }, then: 'amber' },
            ],
            else: 'slate',
          },
        },
      },
    },
  },
};

// A `tone` per activity type — shared by the contact/company feeds below so they
// match the deal modal's dots exactly.
const toneByType = (r: { $var: string }): unknown => ({
  $case: {
    branches: [
      { when: { $eq: [{ $get: { from: r, path: ['type'] } }, 'call'] }, then: 'green' },
      { when: { $eq: [{ $get: { from: r, path: ['type'] } }, 'email'] }, then: 'blue' },
      { when: { $eq: [{ $get: { from: r, path: ['type'] } }, 'meeting'] }, then: 'amber' },
    ],
    else: 'slate',
  },
});

// A contact's recent activity. Shape carries `body` (a note preview) so it stays
// distinct from `activitiesByDeal`/`activitiesByCompany` in the shape-keyed cache.
export const activitiesByContact: CacheEntry = {
  fingerprint: 'activities/byContact',
  intent: "A contact's recent activity (calls, emails, meetings, notes)",
  shape: [{ activity_id: '', type: '', subject: '', body: '', owner: '', when: '', tone: '' }],
  dsl: {
    from: ['activities', 'users'],
    fields: [
      { field: 'activities.id', as: 'activity_id' },
      'activities.type',
      'activities.subject',
      'activities.body',
      'activities.occurred_at',
      { field: 'users.name', as: 'owner' },
    ],
    filter: { eq: ['activities.contact_id', { $context: 'contactId' }] },
    sort: [{ field: 'activities.occurred_at', dir: 'desc' }],
    limit: 12,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        activity_id: { $get: { from: { $var: 'r' }, path: ['activity_id'] } },
        type: { $get: { from: { $var: 'r' }, path: ['type'] } },
        subject: { $get: { from: { $var: 'r' }, path: ['subject'] } },
        body: { $get: { from: { $var: 'r' }, path: ['body'] } },
        owner: { $get: { from: { $var: 'r' }, path: ['owner'] } },
        when: dateText({ $get: { from: { $var: 'r' }, path: ['occurred_at'] } }),
        tone: toneByType({ $var: 'r' }),
      },
    },
  },
};

// A deal's line items — `line_item_id`/product aliased; `line` (qty × price) is a
// DSL compute, money-formatted (with unit price) in the mapping.
export const dealLineItems: CacheEntry = {
  fingerprint: 'activities/lineItems',
  intent: "A deal's line items with product, quantity and line total",
  shape: [{ line_item_id: '', product: '', quantity: 0, unit_price: '', line_total: '' }],
  dsl: {
    from: ['deal_products', 'products'],
    fields: [
      { field: 'deal_products.id', as: 'line_item_id' },
      'deal_products.quantity',
      'deal_products.unit_price',
      { field: 'products.name', as: 'product' },
    ],
    compute: { line: { multiply: ['deal_products.quantity', 'deal_products.unit_price'] } },
    filter: { eq: ['deal_products.deal_id', { $context: 'id' }] },
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        line_item_id: { $get: { from: { $var: 'r' }, path: ['line_item_id'] } },
        product: { $get: { from: { $var: 'r' }, path: ['product'] } },
        quantity: { $get: { from: { $var: 'r' }, path: ['quantity'] } },
        unit_price: money({ $get: { from: { $var: 'r' }, path: ['unit_price'] } }),
        line_total: money({ $get: { from: { $var: 'r' }, path: ['line'] } }),
      },
    },
  },
};
