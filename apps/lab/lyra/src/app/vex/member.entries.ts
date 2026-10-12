import type { CacheEntry } from './index';
import type { Filter } from '@niscorp/vex';
import { dateText, intervalText, pattern, perIntervalText, priceText } from '@lyra/app/prisms/format.prism';
import { STANDING, standingLabel, standingTone, hasSubscription, hasLivePass, onACourse, isStaff, isContact, holdsAnySubscription } from './standing';

const row = (name: string) => ({ $get: { from: { $var: 'm' }, path: [name] } });

const CURRENT: Filter = {
  or: [
    { and: [{ isNotNull: 'studio_people.trial_ends_on' }, { gte: ['studio_people.trial_ends_on', { $scope: 'today' }] }] },
    hasSubscription('studio_people', ['active']),
    hasLivePass('studio_people'),
    onACourse('studio_people'),
  ],
};

const MEMBERS: Filter = hasSubscription('studio_people', ['active', 'paused']);

const PROSPECTS: Filter = {
  and: [
    { not: isStaff('studio_people') },
    { not: holdsAnySubscription('studio_people') },
    { not: hasLivePass('studio_people') },
    { not: onACourse('studio_people') },
    { not: isContact('studio_people') },
  ],
};

const PASSES: Filter = hasLivePass('studio_people');

const ON_A_COURSE: Filter = onACourse('studio_people');

const STAFF_LENS: Filter = isStaff('studio_people');

const CONTACTS: Filter = isContact('studio_people');

const PAST: Filter = {
  and: [holdsAnySubscription('studio_people'), { not: hasSubscription('studio_people', ['active', 'paused']) }],
};

const SEARCH: Filter = { or: [{ ilike: ['people.name', { $context: 'q' }] }, { ilike: ['people.email', { $context: 'q' }] }] };

export const familyForPerson: CacheEntry = {
  fingerprint: 'people/family',
  intent: 'The children a person may act for, at this studio',
  shape: [{ person_id: '', name: '', born_display: '', can_book: false }],
  dsl: {
    from: ['guardianships', 'people'],
    fields: [
      { field: 'guardianships.child_person_id', as: 'person_id' },
      'guardianships.can_book',
      { field: 'people.name', as: 'name' },
      { field: 'people.born_on', as: 'born_on' },
    ],
    filter: {
      and: [
        { eq: ['guardianships.guardian_person_id', { $context: 'personId' }] },
        { eq: ['people.id', 'guardianships.child_person_id'] },
      ],
    },
    sort: [{ field: 'people.born_on', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'm',
      body: {
        person_id: row('person_id'),
        name: row('name'),
        born_display: dateText({ $get: { from: { $var: 'm' }, path: ['born_on'], fallback: { $const: null } } }),
        can_book: { $eq: [row('can_book'), true] },
      },
    },
  },
};

export const ROLL_PAGE = 50;

// Each order has its own cursor key; the key sent says which order the caller
// is in. One shared key would be bound into every arm of the statement, and
// Postgres casts a name to a date before a false guard can matter.
export type RollOrder = { id: string; field: string; dir: 'asc' | 'desc'; rowKey: string; cursor: string };

export const ROLL_ORDERS: readonly RollOrder[] = [
  { id: 'name-asc', field: 'people.name', dir: 'asc', rowKey: 'person_name', cursor: 'afterNameAsc' },
  { id: 'name-desc', field: 'people.name', dir: 'desc', rowKey: 'person_name', cursor: 'afterNameDesc' },
  { id: 'joined-asc', field: 'studio_people.first_seen_on', dir: 'asc', rowKey: 'first_seen_on', cursor: 'afterJoinedAsc' },
  { id: 'joined-desc', field: 'studio_people.first_seen_on', dir: 'desc', rowKey: 'first_seen_on', cursor: 'afterJoinedDesc' },
];

const DEFAULT_ORDER = ROLL_ORDERS[0] as RollOrder;

// `person_id` breaks ties in the same direction whatever the column's: it is
// there to make the order total.
const seekArm = (order: RollOrder): Filter => ({
  optional: {
    key: [order.cursor, 'afterId'],
    then: {
      or: [
        order.dir === 'asc'
          ? { gt: [order.field, { $context: order.cursor }] }
          : { lt: [order.field, { $context: order.cursor }] },
        {
          and: [
            { eq: [order.field, { $context: order.cursor }] },
            { gt: ['studio_people.person_id', { $context: 'afterId' }] },
          ],
        },
      ],
    },
  },
});

// With no cursor every arm drops and the whole `or` disappears: page one.
const AFTER: Filter = { or: ROLL_ORDERS.map(seekArm) };

export const LENSES: ReadonlyArray<{ lens: string; label: string; condition: Filter | undefined }> = [
  { lens: 'current', label: 'Current', condition: CURRENT },
  { lens: 'past', label: 'Past', condition: PAST },
  { lens: 'everyone', label: 'Everyone', condition: undefined },
];

export const HOLDINGS: ReadonlyArray<{ holding: string; label: string; condition: Filter | undefined }> = [
  { holding: 'any', label: 'Anything', condition: undefined },
  { holding: 'membership', label: 'A membership', condition: MEMBERS },
  { holding: 'pass', label: 'A pass', condition: PASSES },
  { holding: 'course', label: 'A course place', condition: ON_A_COURSE },
  { holding: 'nothing', label: 'Nothing yet', condition: PROSPECTS },
  { holding: 'staff', label: 'A staff role', condition: STAFF_LENS },
  { holding: 'contact', label: 'A contact tag', condition: CONTACTS },
];

const lensArm = (lens: string, condition: Filter | undefined): Filter => {
  const guard: Filter = { eq: [{ $context: 'lens' }, lens] };
  return condition === undefined ? guard : { and: [guard, condition] };
};

const LENS: Filter = { or: LENSES.map((l) => lensArm(l.lens, l.condition)) };

const holdingArm = (holding: string, condition: Filter | undefined): Filter => {
  const guard: Filter = { eq: [{ $context: 'holding' }, holding] };
  return condition === undefined ? guard : { and: [guard, condition] };
};

const HOLDING: Filter = { or: HOLDINGS.map((h) => holdingArm(h.holding, h.condition)) };

export const peopleList: CacheEntry = {
  fingerprint: 'people/list',
  intent: 'The studio roll seen through one lens, searched, a page at a time',
  shape: [{ person_id: '', person_name: '', email: '', standing: '', status_display: '', status_tone: '', joined_display: '', first_seen_on: '' }],
  dsl: {
    from: ['studio_people', 'people'],
    fields: [
      'studio_people.person_id',
      'studio_people.first_seen_on',
      { field: 'people.name', as: 'person_name' },
      'people.email',
    ],
    compute: STANDING,
    filter: {
      and: [
        { optional: { key: 'lens', then: LENS } },
        { optional: { key: 'holding', then: HOLDING } },
        { optional: { key: 'q', then: SEARCH } },
        AFTER,
      ],
    },
    // A caller's `sortBy` leads and keeps the `person_id` tiebreaker (vex's
    // `applySortContext`), so every order the roll can be in is total.
    sort: [
      { field: DEFAULT_ORDER.field, dir: DEFAULT_ORDER.dir },
      { field: 'studio_people.person_id', dir: 'asc' },
    ],
    limit: ROLL_PAGE,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'm',
      body: {
        person_id: row('person_id'),
        person_name: row('person_name'),
        email: row('email'),
        standing: row('standing'),
        status_display: standingLabel(row('standing')),
        status_tone: standingTone(row('standing')),
        joined_display: dateText(row('first_seen_on')),
        first_seen_on: row('first_seen_on'),
      },
    },
  },
};

// No seek here: a total that moved with the cursor would not be a total.
export const peopleCount: CacheEntry = {
  fingerprint: 'people/count',
  intent: 'How many people match the current lens and search',
  shape: { total: 0, total_display: '' },
  dsl: {
    from: ['studio_people', 'people'],
    aggregate: { total: { count: 'studio_people.id' } },
    filter: { and: [{ optional: { key: 'lens', then: LENS } }, { optional: { key: 'holding', then: HOLDING } }, { optional: { key: 'q', then: SEARCH } }] },
  },
  mapping: {
    $with: {
      let: { c: { $ref: '$.result' } },
      value: {
        total: { $get: { from: { $var: 'c' }, path: ['total'], fallback: { $const: 0 } } },
        total_display: pattern('{n} matching', { n: { $get: { from: { $var: 'c' }, path: ['total'], fallback: { $const: 0 } } } }),
      },
    },
  },
};

const one = (name: string, fallback: unknown = '') => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: fallback } } });

export const personById: CacheEntry = {
  fingerprint: 'people/byId',
  intent: 'One person this studio knows, with their contact details and derived standing',
  shape: { person_id: '', person_name: '', email: '', phone: '', standing: '', status_display: '', status_tone: '', joined_display: '', source: '', trial_ends_on: '', trial_display: '', notes: '', marketing_ok: false },
  dsl: {
    from: ['studio_people', 'people'],
    fields: [
      'studio_people.person_id',
      'studio_people.first_seen_on',
      'studio_people.source',
      'studio_people.trial_ends_on',
      'studio_people.notes',
      'studio_people.marketing_ok',
      { field: 'people.name', as: 'person_name' },
      'people.email',
      'people.phone',
    ],
    compute: STANDING,
    filter: { eq: ['studio_people.person_id', { $context: 'personId' }] },
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        person_id: one('person_id'),
        person_name: one('person_name'),
        email: one('email'),
        phone: one('phone'),
        standing: one('standing'),
        status_display: standingLabel(one('standing')),
        status_tone: standingTone(one('standing')),
        joined_display: dateText(one('first_seen_on', null)),
        source: one('source'),
        trial_ends_on: one('trial_ends_on', null),
        trial_display: { $case: { branches: [{ when: one('trial_ends_on', null), then: dateText(one('trial_ends_on', null)) }], else: '' } },
        notes: one('notes'),
        marketing_ok: { $get: { from: { $var: 'r' }, path: ['marketing_ok'], fallback: { $const: false } } },
      },
    },
  },
};

export const offeringOptions: CacheEntry = {
  fingerprint: 'offerings/options',
  intent: 'The offerings of one kind currently on sale, shaped for choosing one',
  shape: [{ value: '', label: '' }],
  dsl: {
    from: ['offerings'],
    fields: [{ field: 'offerings.id', as: 'value' }, 'offerings.name', 'offerings.price_cents', 'offerings.currency'],
    filter: { and: [{ eq: ['offerings.kind', { $context: 'kind' }] }, { eq: ['offerings.active', true] }] },
    sort: [{ field: 'offerings.price_cents', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'm',
      body: {
        value: row('value'),
        label: { $join: { parts: [row('name'), ' · ', priceText(row('price_cents'), row('currency'))], sep: '' } },
      },
    },
  },
};

export const offeringsOnSale: CacheEntry = {
  fingerprint: 'offerings/on-sale',
  intent: 'The plans a member can start themselves, with the terms spelled out',
  shape: [{ offering_id: '', name: '', price_display: '', interval_display: '', allowance_display: '', term_display: '' }],
  dsl: {
    from: ['offerings'],
    fields: [{ field: 'offerings.id', as: 'offering_id' }, 'offerings.name', 'offerings.price_cents', 'offerings.currency', 'offerings.interval', 'offerings.interval_count', 'offerings.class_allowance', 'offerings.minimum_term_months', 'offerings.notice_days'],
    filter: { and: [{ eq: ['offerings.kind', 'recurring'] }, { eq: ['offerings.active', true] }] },
    sort: [{ field: 'offerings.price_cents', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'm',
      body: {
        offering_id: row('offering_id'),
        name: row('name'),
        price_display: priceText(row('price_cents'), row('currency')),
        interval_display: perIntervalText(row('interval'), row('interval_count')),
        allowance_display: {
          $case: {
            branches: [
              { when: row('class_allowance'), then: pattern('{n} classes {per}', { n: row('class_allowance'), per: perIntervalText(row('interval'), row('interval_count')) }) },
            ],
            else: 'Unlimited classes',
          },
        },
        // A whole pattern per shape, never a tail glued on: half a sentence
        // cannot be translated.
        term_display: {
          $case: {
            branches: [
              { when: { $and: [row('minimum_term_months'), row('notice_days')] }, then: pattern('{n}-month minimum · {m} days notice', { n: row('minimum_term_months'), m: row('notice_days') }) },
              { when: row('minimum_term_months'), then: pattern('{n}-month minimum', { n: row('minimum_term_months') }) },
              { when: row('notice_days'), then: pattern('Rolling · {n} days notice', { n: row('notice_days') }) },
            ],
            else: 'Rolling — cancel any time',
          },
        },
      },
    },
  },
};

export const offeringsList: CacheEntry = {
  fingerprint: 'offerings/list',
  intent: 'Everything this studio sells — plans and passes, retired ones last',
  shape: [{ offering_id: '', name: '', kind: '', kind_label: '', price_cents: 0, price_display: '', interval: '', interval_count: 0, interval_display: '', class_allowance: 0, allowance_display: '', active: false, state_label: '', state_tone: '', minimum_term_months: 0, notice_days: 0, credits: 0, valid_days: 0, joining_fee_id: '', term_display: '', held_count: 0 }],
  dsl: {
    from: ['offerings'],
    fields: [{ field: 'offerings.id', as: 'offering_id' }, 'offerings.name', 'offerings.kind', 'offerings.price_cents', 'offerings.currency', 'offerings.interval', 'offerings.interval_count', 'offerings.class_allowance', 'offerings.active', 'offerings.minimum_term_months', 'offerings.notice_days', 'offerings.credits', 'offerings.valid_days', 'offerings.joining_fee_id', 'offerings.held_count'],
    sort: [{ field: 'offerings.active', dir: 'desc' }, { field: 'offerings.price_cents', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'm',
      body: {
        offering_id: row('offering_id'),
        name: row('name'),
        kind: row('kind'),
        kind_label: {
          $case: {
            branches: [
              { when: { $eq: [row('kind'), 'pass'] }, then: 'Pass' },
              { when: { $eq: [row('kind'), 'one_off'] }, then: 'One-off' },
            ],
            else: 'Plan',
          },
        },
        price_cents: row('price_cents'),
        price_display: priceText(row('price_cents'), row('currency')),
        interval: row('interval'),
        interval_count: row('interval_count'),
        interval_display: {
          $case: {
            branches: [
              { when: { $eq: [row('kind'), 'pass'] }, then: 'Once' },
              { when: { $eq: [row('kind'), 'one_off'] }, then: 'Once' },
            ],
            else: intervalText(row('interval'), row('interval_count')),
          },
        },
        class_allowance: row('class_allowance'),
        allowance_display: {
          $case: {
            branches: [
              { when: { $eq: [row('kind'), 'pass'] }, then: { $case: { branches: [{ when: { $eq: [row('credits'), 1] }, then: 'Single class' }], else: pattern('{n} classes', { n: row('credits') }) } } },
              { when: { $eq: [row('kind'), 'one_off'] }, then: 'Grants nothing' },
              { when: row('class_allowance'), then: pattern('{n} {per}', { n: row('class_allowance'), per: perIntervalText(row('interval'), row('interval_count')) }) },
            ],
            else: 'Unlimited',
          },
        },
        active: row('active'),
        state_label: { $case: { branches: [{ when: row('active'), then: 'Offered' }], else: 'Retired' } },
        state_tone: { $case: { branches: [{ when: row('active'), then: 'good' }], else: 'neutral' } },
        // The raw values travel so the edit form can round-trip them: without
        // them, fixing a name and pressing Save would write empty terms.
        minimum_term_months: row('minimum_term_months'),
        notice_days: row('notice_days'),
        credits: row('credits'),
        valid_days: row('valid_days'),
        joining_fee_id: row('joining_fee_id'),
        held_count: row('held_count'),
        term_display: {
          $case: {
            branches: [
              {
                when: { $eq: [row('kind'), 'pass'] },
                then: { $case: { branches: [{ when: row('valid_days'), then: pattern('Valid {n} days', { n: row('valid_days') }) }], else: 'Never expires' } },
              },
              { when: { $and: [row('minimum_term_months'), row('notice_days')] }, then: pattern('{n} months · {m} days notice', { n: row('minimum_term_months'), m: row('notice_days') }) },
              { when: row('minimum_term_months'), then: pattern('{n} months', { n: row('minimum_term_months') }) },
              { when: row('notice_days'), then: pattern('Rolling · {n} days notice', { n: row('notice_days') }) },
            ],
            else: 'Rolling',
          },
        },
      },
    },
  },
};
