import type { CacheEntry } from './index';
import type { Filter } from '@niscorp/vex';
import { dateText, pattern, priceText } from '@lyra/app/prisms/format.prism';
import { STANDING, standingLabel, standingTone, hasSubscription, hasLivePass, onACourse, isStaff, isContact, holdsAnySubscription } from './standing';

const row = (name: string) => ({ $get: { from: { $var: 'm' }, path: [name] } });

// ═══════════════════════════════════════════════════════════════
// THE ROLL, LENSED.
//
// People is everyone the studio deals with — members, prospects, pass
// holders, course attendees, staff, contacts, the lapsed — one list over
// `studio_people`, worn through lenses. A lens is a FILTER over the
// relationships a person holds, never a stored category; the standing word
// beside each name is the same derivation every other screen uses.
//
// THE LENS IS A VALUE, not a fingerprint. A computed standing still cannot be
// filtered on (no dialect allows an alias in WHERE), so each lens still states
// its own relationship conditions — but they live as guarded arms of one OR
// rather than as eighteen separate entries, and the caller names which arm it
// means. See `LENS` below for why that stays a flat scan.
// ═══════════════════════════════════════════════════════════════

/** Everyone with LIVE access or a live trial — the working roll. */
const CURRENT: Filter = {
  or: [
    { and: [{ isNotNull: 'studio_people.trial_ends_on' }, { gte: ['studio_people.trial_ends_on', { $scope: 'today' }] }] },
    hasSubscription('studio_people', ['active']),
    hasLivePass('studio_people'),
    onACourse('studio_people'),
  ],
};

/** A recurring relationship, live or on hold. */
const MEMBERS: Filter = hasSubscription('studio_people', ['active', 'paused']);

/** Known, holding nothing — the people to talk to. */
const PROSPECTS: Filter = {
  and: [
    { not: isStaff('studio_people') },
    { not: holdsAnySubscription('studio_people') },
    { not: hasLivePass('studio_people') },
    { not: onACourse('studio_people') },
    { not: isContact('studio_people') },
  ],
};

/** Credits on the books. */
const PASSES: Filter = hasLivePass('studio_people');

/** A seat in a running or upcoming block. */
const ON_A_COURSE: Filter = onACourse('studio_people');

/** Works or teaches here. */
const STAFF_LENS: Filter = isStaff('studio_people');

/** Dealt with, not trained: the supplier, the physio, the guest coach. */
const CONTACTS: Filter = isContact('studio_people');

/** Held a subscription once, holds nothing live now. */
const PAST: Filter = {
  and: [holdsAnySubscription('studio_people'), { not: hasSubscription('studio_people', ['active', 'paused']) }],
};

const SEARCH: Filter = { or: [{ ilike: ['people.name', { $context: 'q' }] }, { ilike: ['people.email', { $context: 'q' }] }] };

/** How many people a page of the roll holds. */
export const ROLL_PAGE = 50;

// ── PAGING BY THE LAST ROW, NOT BY A ROW NUMBER ──────────────
//
// The roll answered fifty people and there was no way to reach the fifty-
// first. A studio is meant to hold two thousand.
//
// This SEEKS rather than offsets: "the next page" is everyone sorted after
// the last row on screen, which the caller already has. That is not a
// workaround for vex having no OFFSET — it is the better technique for a
// list somebody is adding to while reading it. An offset counts rows from
// the start, so a sign-up landing above your position shifts everything
// down and page two silently repeats a person page one already showed;
// a seek is anchored to a value, so it cannot skip or repeat.
//
// The tiebreaker is what makes it correct. Sorting by name alone, two people
// called Anna Berger straddle a page boundary and the second is unreachable
// forever. So the sort key is the PAIR (name, person_id), and the seek is
// that pair's ordinary lexicographic comparison, spelled out in the filter
// grammar rather than needing a row-value operator:
//
//   name > after  OR  (name = after AND person_id > afterId)
//
// The first page sends NO cursor at all — the condition is simply not in the
// query. It used to send an empty string and lean on every name sorting above
// it, which was true for this dataset and not a property of anything.
//
// ── AND THE SEEK KNOWS WHICH ORDER IT IS IN ──────────────────
//
// A cursor is a position in ONE ordering. Sort the roll by first-seen and a
// name-based seek is measuring the wrong axis: page two skips and repeats.
// That is why sorting used to cost the roll its paging — the entry offered one
// order and one cursor, and the caller could change the first without the
// second.
//
// So the orders are DECLARED, once, and both halves are built from the same
// list: the entry's default `sort` is the first entry's, and the seek is one
// guarded arm per order. They cannot disagree, because there is nothing left
// to keep in step by hand.
//
// EACH ORDER CARRIES ITS OWN CURSOR KEY, and which key the caller sends is
// what says which order they are in. There is no separate discriminator —
// presence is the statement, which is exactly what an optional condition is for.
//
// It has to be per-order rather than one shared `after`, and the reason is
// types. All four arms compile into ONE statement, so a single shared param is
// bound once for all of them: a cursor holding a NAME reached the date arms
// too, Postgres cast `'Zy Order 036'` to a date, and the whole read died with a
// 500 — even though those arms were guarded false, because a cast happens
// before a guard can matter. Separate keys mean each comparison binds a value
// of its own column's type, and the arms a caller is not using bind nothing at
// all.
export type RollOrder = { id: string; field: string; dir: 'asc' | 'desc'; rowKey: string; cursor: string };

export const ROLL_ORDERS: readonly RollOrder[] = [
  { id: 'name-asc', field: 'people.name', dir: 'asc', rowKey: 'person_name', cursor: 'afterNameAsc' },
  { id: 'name-desc', field: 'people.name', dir: 'desc', rowKey: 'person_name', cursor: 'afterNameDesc' },
  { id: 'joined-asc', field: 'studio_people.first_seen_on', dir: 'asc', rowKey: 'first_seen_on', cursor: 'afterJoinedAsc' },
  { id: 'joined-desc', field: 'studio_people.first_seen_on', dir: 'desc', rowKey: 'first_seen_on', cursor: 'afterJoinedDesc' },
];

const DEFAULT_ORDER = ROLL_ORDERS[0] as RollOrder;

// One order's seek: strictly past the last row on the sorted column, or level
// with it and past its id. `person_id` breaks every tie in the SAME direction
// whatever the column does, because it is there to make the order total rather
// than to express a preference.
//
// Gated on its own cursor AND `afterId`: both halves of a position, so half a
// cursor drops the condition instead of leaving a hole that answers empty.
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

// An `or` of optionals: send no cursor and every arm drops, so the whole
// condition disappears and this is page one. Send one and the `or` collapses
// to that arm alone.
const AFTER: Filter = { or: ROLL_ORDERS.map(seekArm) };

export const LENSES: ReadonlyArray<{ lens: string; label: string; condition: Filter | undefined }> = [
  { lens: 'current', label: 'Current', condition: CURRENT },
  { lens: 'members', label: 'Members', condition: MEMBERS },
  { lens: 'prospects', label: 'Prospects', condition: PROSPECTS },
  { lens: 'passes', label: 'Passes', condition: PASSES },
  { lens: 'course', label: 'On a course', condition: ON_A_COURSE },
  { lens: 'staff', label: 'Staff', condition: STAFF_LENS },
  { lens: 'contacts', label: 'Contacts', condition: CONTACTS },
  { lens: 'past', label: 'Past', condition: PAST },
  { lens: 'everyone', label: 'Everyone', condition: undefined },
];

// ── NINE LENSES, ONE ENTRY ───────────────────────────────────
//
// Each arm guards its own conditions behind the lens NAME, so exactly one arm
// can be live per call and the OR reduces to that lens's filter. `everyone` is
// the arm that guards nothing.
//
// This is one flat scan, not nine nested ones: the roll's base IS the anchor,
// and `anchored()` (standing.ts) returns bare local predicates when the base
// is `studio_people`. Every arm is therefore a comparison against a mirror
// column on the row already being read — the same columns the standing
// derivation above uses. Nothing here reaches into another table.
//
// The guard is `{ $context } = literal`, which binds the lens once per arm and
// compares it to a constant. A lens the caller invents matches no arm and
// returns nothing, so the grammar is still closed: naming a lens is choosing
// from this list, not writing a filter.
const lensArm = (lens: string, condition: Filter | undefined): Filter => {
  const guard: Filter = { eq: [{ $context: 'lens' }, lens] };
  return condition === undefined ? guard : { and: [guard, condition] };
};

const LENS: Filter = { or: LENSES.map((l) => lensArm(l.lens, l.condition)) };

export const peopleList: CacheEntry = {
  fingerprint: 'people/list',
  intent: 'The studio roll seen through one lens, searched, a page at a time',
  // `first_seen_on` travels RAW as well as pretty: it is a sortable column, so
  // the cursor has to carry its value, and a formatted date cannot be compared
  // against one. Same reason the timetable carries raw values beside displays.
  shape: [{ person_id: '', person_name: '', email: '', standing: '', status_display: '', status_tone: '', joined_display: '', first_seen_on: '' }],
  dsl: {
    from: ['studio_people', 'people'],
    fields: [
      'studio_people.person_id',
      'studio_people.first_seen_on',
      { field: 'people.name', as: 'person_name' },
      'people.email',
    ],
    // Computed by the engine against the studio's own day — see `standing.ts`.
    compute: STANDING,
    // THREE QUESTIONS THE CALLER TURNS ON, or leaves off. Send none of them and
    // this is the whole roll; each key adds a condition rather than filling a
    // hole in one. No sentinels: "everyone" is not `lens: 'everyone'` plus
    // `q: '%'` plus `after: ''` — it is an empty context.
    filter: {
      and: [
        { optional: { key: 'lens', then: LENS } },
        { optional: { key: 'q', then: SEARCH } },
        // The seek: one arm per order, each gating on its own cursor. Nothing
        // wraps it, because the arms gate themselves — see `seekArm`.
        AFTER,
      ],
    },
    // The default order, from the same declaration the seek arms are built
    // from — and `person_id` behind it, which is what makes the order total.
    // A caller's `sortBy` leads and keeps this tiebreaker (vex's
    // applySortContext), so every order the roll can be in ends the same way.
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
        // The cursor's value when the roll is in first-seen order.
        first_seen_on: row('first_seen_on'),
      },
    },
  },
};

// The same lens and the same search, counted. Two entries rather than one
// because a count is an aggregate over the whole match and a page is fifty
// rows of it — one query cannot be both. The seek is deliberately absent: a
// total that moved with the cursor would not be a total.
export const peopleCount: CacheEntry = {
  fingerprint: 'people/count',
  intent: 'How many people match the current lens and search',
  // The sentence, not just the number: a layout binds values and cannot
  // concatenate, so formatting on the way out is the only place it happens once.
  shape: { total: 0, total_display: '' },
  dsl: {
    from: ['studio_people', 'people'],
    aggregate: { total: { count: 'studio_people.id' } },
    // The same two questions the list takes, minus the cursor — see above.
    filter: { and: [{ optional: { key: 'lens', then: LENS } }, { optional: { key: 'q', then: SEARCH } }] },
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
        // Whether this studio may write to them beyond what they booked. On the
        // person's own record because that is where the desk asks the question.
        marketing_ok: { $get: { from: { $var: 'r' }, path: ['marketing_ok'], fallback: { $const: false } } },
      },
    },
  },
};

// What a Select needs and nothing else — the choosing shape of the price list.
//
// The KIND is the caller's, because it is a value the price list already holds
// and not a different question. What used to be two entries guaranteed by
// separate fingerprints that a plan screen could not offer passes; that
// guarantee now lives where the screen does — each Select names its kind, and
// the column's own CHECK bounds the word to 'recurring' or 'pass'.
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

// The member-facing price list — what the CTA dashboard offers a prospect at
// the plan-choice cliff. Recurring and on sale only, with the terms IN WORDS,
// because a person about to commit to twelve months is owed the sentence
// before the confirm sheet asks for their word (D2: immediate + hard confirm).
export const offeringsOnSale: CacheEntry = {
  fingerprint: 'offerings/on-sale',
  intent: 'The plans a member can start themselves, with the terms spelled out',
  shape: [{ offering_id: '', name: '', price_display: '', interval_display: '', allowance_display: '', term_display: '' }],
  dsl: {
    from: ['offerings'],
    fields: [{ field: 'offerings.id', as: 'offering_id' }, 'offerings.name', 'offerings.price_cents', 'offerings.currency', 'offerings.interval', 'offerings.class_allowance', 'offerings.minimum_term_months', 'offerings.notice_days'],
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
        interval_display: { $case: { branches: [{ when: { $eq: [row('interval'), 'year'] }, then: 'a year' }], else: 'a month' } },
        allowance_display: { $case: { branches: [{ when: row('class_allowance'), then: pattern('{n} classes a month', { n: row('class_allowance') }) }], else: 'Unlimited classes' } },
        // Whole patterns per shape, never an optional tail glued on — half a
        // sentence translates like half a sentence.
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

// ─── the price list ──────────────────────────────────────────

export const offeringsList: CacheEntry = {
  fingerprint: 'offerings/list',
  intent: 'Everything this studio sells — plans and passes, retired ones last',
  shape: [{ offering_id: '', name: '', kind: '', kind_label: '', price_cents: 0, price_display: '', interval: '', interval_display: '', class_allowance: 0, allowance_display: '', active: false, state_label: '', state_tone: '', minimum_term_months: 0, notice_days: 0, credits: 0, valid_days: 0, term_display: '' }],
  dsl: {
    from: ['offerings'],
    fields: [{ field: 'offerings.id', as: 'offering_id' }, 'offerings.name', 'offerings.kind', 'offerings.price_cents', 'offerings.currency', 'offerings.interval', 'offerings.class_allowance', 'offerings.active', 'offerings.minimum_term_months', 'offerings.notice_days', 'offerings.credits', 'offerings.valid_days'],
    // Retired offerings sort last but stay on the list. A price a studio
    // stopped offering is still a price somebody is paying.
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
        kind_label: { $case: { branches: [{ when: { $eq: [row('kind'), 'pass'] }, then: 'Pass' }], else: 'Plan' } },
        price_cents: row('price_cents'),
        price_display: priceText(row('price_cents'), row('currency')),
        interval: row('interval'),
        interval_display: {
          $case: {
            branches: [
              { when: { $eq: [row('kind'), 'pass'] }, then: 'One-off' },
              { when: { $eq: [row('interval'), 'year'] }, then: 'Yearly' },
            ],
            else: 'Monthly',
          },
        },
        class_allowance: row('class_allowance'),
        // NULL allowance means unlimited — said in words rather than left as a
        // blank cell somebody has to interpret. A pass's allowance IS its credits.
        allowance_display: {
          $case: {
            branches: [
              { when: { $eq: [row('kind'), 'pass'] }, then: { $case: { branches: [{ when: { $eq: [row('credits'), 1] }, then: 'Single class' }], else: pattern('{n} classes', { n: row('credits') }) } } },
              { when: row('class_allowance'), then: pattern('{n} a month', { n: row('class_allowance') }) },
            ],
            else: 'Unlimited',
          },
        },
        active: row('active'),
        state_label: { $case: { branches: [{ when: row('active'), then: 'Offered' }], else: 'Retired' } },
        state_tone: { $case: { branches: [{ when: row('active'), then: 'good' }], else: 'neutral' } },
        // The raw values travel so the edit form can round-trip them — without
        // that, opening an offering to fix its name and pressing Save would
        // write empty terms over a twelve-month commitment.
        minimum_term_months: row('minimum_term_months'),
        notice_days: row('notice_days'),
        credits: row('credits'),
        valid_days: row('valid_days'),
        // And the terms as a phrase, because "6 months · 60 days notice" is what
        // a studio is selling and a price list that omits it is not a price list.
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
