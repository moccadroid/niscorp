import type { CacheEntry, MutationEntry } from './index';
import { dateText } from '@lyra/app/prisms/format.prism';

// PEOPLE WHO HAVE NOT SIGNED YET — AND THEY ARE MEMBERSHIPS.
//
// The gap this fills is not "a CRM". It is that a studio could not answer "how
// many people asked about us last month, and how many of them joined" — every
// enquiry lived in somebody's inbox, and the only people the app knew about
// were the ones who had already paid.
//
// The first answer was a `leads` TABLE, defended on the grounds that "a lead
// is deliberately NOT a membership with a status: a membership means somebody
// trains here." That was wrong twice over. A membership does not mean somebody
// trains — it is a person's RELATIONSHIP with one studio, and a lapsed member
// does not train either. And the separate table meant a lead carried its own
// name, email and phone: a second, shadow human, with a nullable `person_id`
// "set when they become a member" that nothing in the app ever wrote. So the
// conversion retyped them, the enquiry never reached the member record, and
// the question the whole table existed for stayed unanswerable.
//
// An enquiry is the membership at stage zero. Converting is a status change.
// Every read below is the roll, filtered — and the reads that count the roll
// exclude `enquired`, because somebody who asked about prices is not on it.
const row = (name: string) => ({ $get: { from: { $var: 'l' }, path: [name] } });

const SOURCE_LABEL = {
  $case: {
    branches: [
      { when: { $eq: [row('source'), 'walk-in'] }, then: 'Walked in' },
      { when: { $eq: [row('source'), 'website'] }, then: 'Website' },
      { when: { $eq: [row('source'), 'referral'] }, then: 'Referral' },
      { when: { $eq: [row('source'), 'social'] }, then: 'Social' },
      { when: { $eq: [row('source'), 'event'] }, then: 'Event' },
    ],
    else: 'Other',
  },
};

// The enquiry's own outcomes, read off the membership lifecycle it now shares
// with everybody else: still asking, joined (any live status), or gone.
const STATUS_LABEL = {
  $case: {
    branches: [
      { when: { $eq: [row('status'), 'enquired'] }, then: 'Asked' },
      { when: { $eq: [row('status'), 'trialling'] }, then: 'On trial' },
      { when: { $eq: [row('status'), 'cancelled'] }, then: 'Gone' },
      { when: { $eq: [row('status'), 'lapsed'] }, then: 'Gone' },
    ],
    else: 'Joined',
  },
};

const STATUS_TONE = {
  $case: {
    branches: [
      { when: { $eq: [row('status'), 'enquired'] }, then: 'calm' },
      { when: { $eq: [row('status'), 'trialling'] }, then: 'warm' },
      { when: { $eq: [row('status'), 'cancelled'] }, then: 'neutral' },
      { when: { $eq: [row('status'), 'lapsed'] }, then: 'neutral' },
    ],
    else: 'good',
  },
};

export const leadsList: CacheEntry = {
  fingerprint: 'leads/list',
  intent: 'Enquiries at this studio in the given statuses',
  shape: [{ lead_id: '', person_id: '', name: '', email: '', phone: '', source_label: '', status: '', status_label: '', status_tone: '', created_display: '', notes: '' }],
  dsl: {
    // The person comes along because a human's name lives on the human, once.
    from: ['memberships', 'people'],
    fields: [
      { field: 'memberships.id', as: 'membership_id' },
      'memberships.person_id',
      'memberships.status',
      'memberships.source',
      'memberships.notes',
      'memberships.joined_on',
      { field: 'people.name', as: 'name' },
      'people.email',
      'people.phone',
    ],
    // SEARCHABLE, like the roll. This list is read to find ONE person — "did
    // that woman from Tuesday ever come back" — and three months of enquiries
    // is a scroll. Only the roll had a search box, which is not a decision
    // anybody made: it is the screen that got the pass.
    //
    // Same clause the roll uses, for the same reason: the pattern is built by
    // the CALLER (`%name%`) because `$context` is a value and never a fragment,
    // and an empty box sends `%%`, so there is no second query and no branch.
    filter: {
      and: [
        { in: ['memberships.status', { $context: 'statuses' }] },
        { or: [{ ilike: ['people.name', { $context: 'q' }] }, { ilike: ['people.email', { $context: 'q' }] }] },
      ],
    },
    // Newest first: an enquiry from this morning is worth more than one from
    // March, which is the opposite of how the roll is read.
    sort: [{ field: 'memberships.joined_on', dir: 'desc' }],
    limit: 100,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'l',
      body: {
        lead_id: row('membership_id'),
        person_id: row('person_id'),
        name: row('name'),
        email: row('email'),
        phone: row('phone'),
        notes: row('notes'),
        source_label: SOURCE_LABEL,
        status: row('status'),
        status_label: STATUS_LABEL,
        status_tone: STATUS_TONE,
        created_display: dateText(row('joined_on')),
      },
    },
  },
};

// WHERE THEY CAME FROM, counted — and now it can actually say how many joined,
// because the enquiry and the membership are the same row. Under the old shape
// this grouped a table whose `person_id` was never written, so the half of the
// question that mattered had no data behind it at all.
export const leadsBySource: CacheEntry = {
  fingerprint: 'leads/by-source',
  intent: 'Enquiries by source, and how many of each joined',
  shape: [{ source: '', total: 0 }],
  dsl: {
    from: ['memberships'],
    fields: ['memberships.source'],
    aggregate: { total: { count: 'memberships.id' } },
    groupBy: ['memberships.source'],
    sort: [{ field: 'memberships.source', dir: 'asc' }],
  },
};

// ── the writes ───────────────────────────────────────────────
//
// Recording an enquiry is `intake/membership` with `status: 'enquired'` — the
// same mutation that signs somebody up, because it is the same row. See
// `server/functions/members.ts`: the fn finds the person by email or creates
// them, then writes one membership. An enquiry differs by one word.

export const leadSetStatus: MutationEntry = {
  fingerprint: 'leads/set-status',
  intent: 'Move an enquiry along',
  mutation: {
    op: 'update',
    table: 'memberships',
    set: { status: { $context: 'status' } },
    where: { eq: ['memberships.id', { $context: 'leadId' }] },
  },
};
