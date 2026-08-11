import type { CacheEntry } from './index';
import { dateText, priceText, statusText, statusTone } from '@lyra/app/prisms/format.prism';

// Members. Every read here joins THROUGH `memberships`, which is the scoped
// table — that is what keeps `people`, which is shared across studios, from
// answering for somebody else's roll (see behaviors.ts).

const row = (name: string) => ({ $get: { from: { $var: 'm' }, path: [name] } });

// ONE read, parameterised by which statuses to include.
//
// The alternative was two entries and a trigger that chose between them — and
// the trigger grammar has no conditional, which turned out to be the useful
// constraint: it pushed the difference into the QUERY, where it belongs, and
// left the list with a single endpoint that re-reads correctly no matter which
// slice is showing. A `members-changed` handler that had to remember which of
// two reads was current is a bug waiting for the first save.
//
// A context-parameterised fingerprint is not a hole in replay-only: the
// STATEMENT is still authored and server-side, and the caller supplies values
// into it, exactly as `members/byId` takes an id.
// HOW MANY MATCH, which a capped list cannot tell you about itself.
//
// Without it a roll of 2,000 shows 50 rows and looks complete. The screen says
// "50 of 2,000" instead, which is the difference between a filter and a lie.
export const membersMatching: CacheEntry = {
  fingerprint: 'members/count',
  intent: 'How many memberships match the current search and statuses',
  // The SENTENCE, not just the number. A layout cannot concatenate — it binds
  // values — and a trigger's  resolves bindings without evaluating prism
  // ops. Formatting on the way out is the only place it can happen once.
  shape: { total: 0, total_display: '' },
  dsl: {
    from: ['memberships', 'people'],
    aggregate: { total: { count: 'memberships.id' } },
    filter: {
      and: [
        { in: ['memberships.status', { $context: 'statuses' }] },
        { or: [{ ilike: ['people.name', { $context: 'q' }] }, { ilike: ['people.email', { $context: 'q' }] }] },
      ],
    },
  },
  mapping: {
    $with: {
      let: { c: { $ref: '$.result' } },
      value: {
        total: { $get: { from: { $var: 'c' }, path: ['total'], fallback: { $const: 0 } } },
        total_display: { $join: { parts: [{ $get: { from: { $var: 'c' }, path: ['total'], fallback: { $const: 0 } } }, ' matching'], sep: '' } },
      },
    },
  },
};

export const membersList: CacheEntry = {
  fingerprint: 'members/list',
  intent: 'Memberships at this studio in the given statuses, with the person behind each',
  shape: [{ membership_id: '', person_name: '', email: '', status: '', status_display: '', status_tone: '', joined_display: '' }],
  dsl: {
    from: ['memberships', 'people'],
    fields: [
      { field: 'memberships.id', as: 'membership_id' },
      'memberships.status',
      'memberships.joined_on',
      { field: 'people.name', as: 'person_name' },
      'people.email',
    ],
    // SEARCHABLE AND BOUNDED, because the target is 50–2,000 members a studio.
    //
    // This read had neither. It returned every membership in the studio and the
    // screen rendered all of them — fine against a seed of five, a broken page
    // at the number this app is being built for, and the desk's way of finding
    // somebody was to scroll.
    //
    // The pattern is built by the CALLER (`%name%`), because `$context` is a
    // value and not a fragment — vex will not let a caller supply SQL, only
    // something to compare against. An empty search sends `%`, which matches
    // everything, so there is no second query and no branch.
    filter: {
      and: [
        { in: ['memberships.status', { $context: 'statuses' }] },
        { or: [{ ilike: ['people.name', { $context: 'q' }] }, { ilike: ['people.email', { $context: 'q' }] }] },
      ],
    },
    sort: [{ field: 'people.name', dir: 'asc' }],
    // A CEILING, NOT A PAGE. A studio with two thousand members does not want
    // page 14 of the roll; they want to type three letters. The limit is what
    // keeps the screen honest when they have not typed anything yet, and the
    // count below is what stops it lying about how many there are.
    limit: 50,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'm',
      body: {
        membership_id: row('membership_id'),
        person_name: row('person_name'),
        email: row('email'),
        // The raw value travels alongside the display one so a form can
        // round-trip and a filter can compare without re-parsing a label.
        status: row('status'),
        status_display: statusText(row('status')),
        status_tone: statusTone(row('status')),
        joined_display: dateText(row('joined_on')),
      },
    },
  },
};

// One membership, for the detail surface. A single-row shape means vex maps
// the FIRST row and hands NULL when nothing matched — so every field states its
// own absent value. Finding no row is ordinary: an id another studio owns, and
// the engine filtered it out.
const one = (name: string, fallback: unknown = '') => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: fallback } } });

export const memberById: CacheEntry = {
  fingerprint: 'members/byId',
  intent: 'One membership at this studio, with the person and their contact details',
  shape: { membership_id: '', person_name: '', email: '', phone: '', status: '', status_display: '', status_tone: '', joined_display: '', notes: '' },
  dsl: {
    from: ['memberships', 'people'],
    fields: [
      { field: 'memberships.id', as: 'membership_id' },
      'memberships.status',
      'memberships.joined_on',
      'memberships.notes',
      { field: 'people.name', as: 'person_name' },
      'people.email',
      'people.phone',
    ],
    filter: { eq: ['memberships.id', { $context: 'membershipId' }] },
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        membership_id: one('membership_id'),
        person_name: one('person_name'),
        email: one('email'),
        phone: one('phone'),
        status: one('status'),
        status_display: statusText(one('status')),
        status_tone: statusTone(one('status')),
        joined_display: dateText(one('joined_on', null)),
        notes: one('notes'),
      },
    },
  },
};

// What this studio sells.
export const plansList: CacheEntry = {
  fingerprint: 'plans/list',
  intent: 'The plans this studio offers',
  shape: [{ plan_id: '', name: '', price_cents: 0, price_display: '', interval: '', interval_display: '', class_allowance: 0, allowance_display: '', active: false, state_label: '', state_tone: '' }],
  dsl: {
    from: ['plans'],
    fields: [{ field: 'plans.id', as: 'plan_id' }, 'plans.name', 'plans.price_cents', 'plans.interval', 'plans.class_allowance', 'plans.active'],
    // Retired plans sort last but stay on the list. A price a studio stopped
    // offering is still a price somebody is paying.
    sort: [{ field: 'plans.active', dir: 'desc' }, { field: 'plans.price_cents', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'm',
      body: {
        plan_id: row('plan_id'),
        name: row('name'),
        // Both halves of every value: the raw column so the edit form can
        // prefill from the row it was clicked on, and the display string so
        // no layout has to know what a cent is.
        price_cents: row('price_cents'),
        price_display: priceText(row('price_cents')),
        interval: row('interval'),
        interval_display: { $case: { branches: [{ when: { $eq: [row('interval'), 'year'] }, then: 'Yearly' }], else: 'Monthly' } },
        class_allowance: row('class_allowance'),
        // NULL allowance means unlimited — said in words rather than left as a
        // blank cell somebody has to interpret.
        allowance_display: { $case: { branches: [{ when: row('class_allowance'), then: { $join: { parts: [row('class_allowance'), ' a month'], sep: '' } } }], else: 'Unlimited' } },
        active: row('active'),
        state_label: { $case: { branches: [{ when: row('active'), then: 'Offered' }], else: 'Retired' } },
        state_tone: { $case: { branches: [{ when: row('active'), then: 'good' }], else: 'neutral' } },
      },
    },
  },
};
