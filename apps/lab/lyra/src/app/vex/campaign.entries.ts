import type { CacheEntry, MutationEntry } from './index';
import type { ComputeExpression, Filter } from '@niscorp/vex';
import { LENSES, HOLDINGS } from './member.entries';
import { dateText, pattern } from '@lyra/app/prisms/format.prism';

const row = (name: string) => ({ $get: { from: { $var: 'c' }, path: [name] } });
const num = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: 0 } } });

const lensNamed = (name: string): Filter | undefined => LENSES.find((l) => l.lens === name)?.condition;
const holdingNamed = (name: string): Filter | undefined => HOLDINGS.find((h) => h.holding === name)?.condition;

const pair = (lens: string, holding: string): Filter => {
  const arms = [lensNamed(lens), holdingNamed(holding)].filter((c): c is Filter => c !== undefined);
  return arms.length === 1 && arms[0] !== undefined ? arms[0] : { and: arms };
};

const GONE_QUIET: Filter = {
  and: [
    pair('current', 'membership'),
    {
      not: {
        exists: {
          from: ['bookings', 'class_sessions'],
          filter: {
            and: [
              { eq: ['bookings.person_id', 'studio_people.person_id'] },
              { eq: ['bookings.studio_id', 'studio_people.studio_id'] },
              { eq: ['bookings.attended', true] },
              { gte: ['class_sessions.held_on', { $context: 'cutoff' }] },
            ],
          },
        },
      },
    },
  ],
};

const GIVEN_NOTICE: Filter = {
  exists: {
    from: ['subscriptions'],
    filter: {
      and: [
        { eq: ['subscriptions.person_id', 'studio_people.person_id'] },
        { eq: ['subscriptions.studio_id', 'studio_people.studio_id'] },
        { eq: ['subscriptions.status', 'active'] },
        { isNotNull: 'subscriptions.notice_given_on' },
        { gte: ['subscriptions.ends_on', { $scope: 'today' }] },
      ],
    },
  },
};

export const AUDIENCES: ReadonlyArray<{
  id: string;
  phrase: string;
  blurb: string;
  windowed: boolean;
  condition: Filter;
}> = [
  { id: 'roll/current', phrase: 'Everyone current', blurb: 'Everybody with live access or a running trial.', windowed: false, condition: pair('current', 'any') },
  { id: 'roll/members', phrase: 'Membership holders', blurb: 'Everybody on a recurring plan.', windowed: false, condition: pair('current', 'membership') },
  { id: 'roll/passes', phrase: 'Pass holders', blurb: 'Credits still on the books.', windowed: false, condition: pair('current', 'pass') },
  { id: 'roll/course', phrase: 'On a course', blurb: 'A seat in a block that has not finished.', windowed: false, condition: pair('current', 'course') },
  { id: 'roll/prospects', phrase: 'Prospects', blurb: 'Known here, holding nothing yet.', windowed: false, condition: pair('current', 'nothing') },
  { id: 'roll/past', phrase: 'Past members', blurb: 'Held something once, holding nothing now.', windowed: false, condition: pair('past', 'any') },
  { id: 'quiet', phrase: 'Gone quiet', blurb: 'Still paying, not turning up.', windowed: true, condition: GONE_QUIET },
  { id: 'notice', phrase: 'Given notice', blurb: 'Leaving on a date already fixed.', windowed: false, condition: GIVEN_NOTICE },
];

const AUDIENCE: Filter = {
  or: AUDIENCES.map((a) => ({ and: [{ eq: [{ $context: 'audience' }, a.id] }, a.condition] })),
};

const EXCEPT: Filter = { optional: { key: 'except', then: { notIn: ['studio_people.person_id', { $context: 'except' }] } } };

// Every caller sends `cutoff`, including for an audience that does not use it.
// It must not become optional: an absent key drops the condition it wraps, and
// "gone quiet" with no window would mean every member.
const QUESTION: Filter = { and: [AUDIENCE, EXCEPT] };

const HAS_ADDRESS: Filter = { isNotNull: 'studio_people.mail_to' };
const NO_ADDRESS: Filter = { isNull: 'studio_people.mail_to' };
const OPTED_IN: Filter = { eq: ['studio_people.marketing_ok', true] };
const ON_THE_LIST: Filter = {
  exists: {
    from: ['mail_suppressions'],
    filter: {
      and: [
        { eq: ['mail_suppressions.address', 'studio_people.mail_to'] },
        // An empty `studio_id` suppresses the address for every studio (a dead
        // address); otherwise it is this studio's own complaint.
        { or: [{ eq: ['mail_suppressions.studio_id', ''] }, { eq: ['mail_suppressions.studio_id', 'studio_people.studio_id'] }] },
      ],
    },
  },
};

const DISPOSITION: ComputeExpression = {
  case: {
    when: [
      { condition: NO_ADDRESS, then: 'no_address' },
      { condition: { eq: ['studio_people.marketing_ok', false] }, then: 'no_consent' },
      { condition: ON_THE_LIST, then: 'suppressed' },
    ],
    else: 'ok',
  },
};

// The disposition as a filter: the write cannot read a computed alias in a
// WHERE, and must enforce this itself rather than trust the sheet.
const WRITABLE: Filter = { and: [HAS_ADDRESS, OPTED_IN, { not: ON_THE_LIST }] };

export const campaignAudienceCount: CacheEntry = {
  fingerprint: 'campaigns/audience-count',
  intent: 'How many people a question reaches at all',
  shape: { total: 0, total_display: '' },
  dsl: {
    from: ['studio_people', 'people'],
    aggregate: { total: { count: 'studio_people.id' } },
    filter: QUESTION,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        total: num('total'),
        total_display: pattern('{n} in this list', { n: num('total') }),
      },
    },
  },
};

export const campaignAudienceWritable: CacheEntry = {
  fingerprint: 'campaigns/audience-writable',
  intent: 'How many of the people a question reaches can honestly be written to',
  shape: { ok: 0, ok_display: '' },
  dsl: {
    from: ['studio_people', 'people'],
    aggregate: { ok: { count: 'studio_people.id' } },
    filter: { and: [QUESTION, WRITABLE] },
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: { ok: num('ok'), ok_display: pattern('{n} will be written to', { n: num('ok') }) },
    },
  },
};

export const UNTICK_LIMIT = 200;

export const campaignAudiencePage: CacheEntry = {
  fingerprint: 'campaigns/audience-page',
  intent: 'The people a question reaches, by name, with what is true of each',
  // No address in this shape on purpose: it would put the studio's whole
  // mailing list on the wire to draw a list of names.
  shape: [{ person_id: '', person_name: '', disposition: '' }],
  dsl: {
    from: ['studio_people', 'people'],
    fields: ['studio_people.person_id', { field: 'people.name', as: 'person_name' }],
    compute: { disposition: DISPOSITION },
    filter: QUESTION,
    sort: [
      { field: 'people.name', dir: 'asc' },
      { field: 'studio_people.person_id', dir: 'asc' },
    ],
    limit: UNTICK_LIMIT,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'c',
      body: {
        person_id: row('person_id'),
        person_name: row('person_name'),
        disposition: row('disposition'),
      },
    },
  },
};

// A read that authors no limit is given vex's `defaultLimit`, and a list that
// decides who receives mail must not be cut silently. So the fan-out pages:
// `after` seeks on `person_id`, which the sort makes total.
export const RESOLVE_PAGE = 1000;

export const campaignAudienceResolve: CacheEntry = {
  fingerprint: 'campaigns/audience-resolve',
  intent: 'One page of the people a question reaches who can honestly be written to, with where their mail goes',
  shape: [{ person_id: '', to_address: '' }],
  dsl: {
    from: ['studio_people', 'people'],
    fields: ['studio_people.person_id', { field: 'studio_people.mail_to', as: 'to_address' }],
    filter: {
      and: [
        QUESTION,
        WRITABLE,
        { optional: { key: 'after', then: { gt: ['studio_people.person_id', { $context: 'after' }] } } },
      ],
    },
    sort: [{ field: 'studio_people.person_id', dir: 'asc' }],
    limit: RESOLVE_PAGE,
  },
};

// `queued` counts here: a campaign's rows wait for dispatch, and counting only
// what has gone would let two campaigns both pass a ceiling neither fits under.
export const campaignsSentToday: CacheEntry = {
  fingerprint: 'campaigns/sent-today',
  intent: "How much of the studio's daily mail allowance today has already spoken for",
  shape: { used: 0, used_display: '' },
  dsl: {
    from: ['outbox'],
    aggregate: { used: { count: 'outbox.id' } },
    filter: { and: [{ eq: ['outbox.created_on', { $scope: 'today' }] }, { in: ['outbox.state', ['queued', 'sending', 'sent']] }] },
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: { used: num('used'), used_display: pattern('{n} sent today', { n: num('used') }) },
    },
  },
};

export const campaignsList: CacheEntry = {
  fingerprint: 'campaigns/list',
  intent: 'What this studio has sent, newest first, with the question each one asked',
  shape: [{ campaign_id: '', subject: '', audience_display: '', state: '', state_display: '', queued_count: 0, sent_display: '', refused_reason: '' }],
  dsl: {
    from: ['campaigns', 'campaign_audiences'],
    fields: [
      { field: 'campaigns.id', as: 'campaign_id' },
      'campaigns.subject',
      'campaigns.state',
      'campaigns.queued_count',
      'campaigns.refused_reason',
      'campaigns.sent_at',
      { field: 'campaign_audiences.phrase', as: 'audience_phrase' },
    ],
    sort: [{ field: 'campaigns.created_at', dir: 'desc' }],
    limit: 50,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'c',
      body: {
        campaign_id: row('campaign_id'),
        subject: row('subject'),
        audience_display: row('audience_phrase'),
        state: row('state'),
        state_display: {
          $case: {
            branches: [
              { when: { $eq: [row('state'), 'draft'] }, then: 'Draft' },
              { when: { $eq: [row('state'), 'sending'] }, then: 'Going out' },
              { when: { $eq: [row('state'), 'sent'] }, then: 'Sent' },
              { when: { $eq: [row('state'), 'refused'] }, then: 'Not sent' },
            ],
            else: '',
          },
        },
        queued_count: row('queued_count'),
        sent_display: dateText({ $get: { from: { $var: 'c' }, path: ['sent_at'], fallback: { $const: null } } }),
        refused_reason: row('refused_reason'),
      },
    },
  },
};

// `state = 'sending'` is in the filter, so the reflex can arm on any
// `campaigns` insert: a draft, or a campaign already sent, selects no row.
export const campaignPending: CacheEntry = {
  fingerprint: 'campaigns/pending',
  intent: 'One campaign waiting to go out, with the question it asked and the ceiling it must fit under',
  shape: [{ campaign_id: '', studio_id: '', audience: '', audience_days: 0, excluded: [], subject: '', body: '', daily_cap: 0 }],
  dsl: {
    from: ['campaigns', 'studios'],
    fields: [
      { field: 'campaigns.id', as: 'campaign_id' },
      'campaigns.studio_id',
      'campaigns.audience',
      'campaigns.audience_days',
      'campaigns.excluded',
      'campaigns.subject',
      'campaigns.body',
      { field: 'studios.daily_mail_cap', as: 'daily_cap' },
    ],
    filter: { and: [{ eq: ['campaigns.id', { $context: 'campaignId' }] }, { eq: ['campaigns.state', 'sending'] }] },
  },
};

export const campaignCreate: MutationEntry = {
  fingerprint: 'campaigns/create',
  intent: 'Record what the studio has decided to say, and to which of its people',
  mutation: {
    op: 'insert',
    table: 'campaigns',
    values: {
      audience: { $context: 'audience' },
      audience_days: { $context: 'audienceDays' },
      excluded: { $context: 'excluded' },
      subject: { $context: 'subject' },
      body: { $context: 'body' },
      state: 'sending',
    },
  },
};

// The address is an `$item`: a `$lookup` inside `insertEach` compiles once and
// would put one person's address on every row. ON CONFLICT with no `set` does
// nothing (`outbox_campaign_person`): a re-run after a crash sends no copies.
export const campaignFanOut: MutationEntry = {
  fingerprint: 'campaigns/fan-out',
  intent: 'Queue one message per person a campaign reaches',
  mutation: {
    op: 'insertEach',
    table: 'outbox',
    items: { $context: 'recipients' },
    values: {
      person_id: { $item: 'person_id' },
      to_address: { $item: 'to_address' },
      campaign_id: { $context: 'campaignId' },
      subject: { $context: 'subject' },
      body: { $context: 'body' },
      source: { $context: 'source' },
      // A constant on purpose: bulk mail from a list is marketing, and nobody
      // gets to turn off its unsubscribe footer and List-Unsubscribe headers.
      marketing: true,
    },
    onConflict: { target: ['campaign_id', 'person_id'] },
  },
};

export const campaignStampSent: MutationEntry = {
  fingerprint: 'campaigns/stamp-sent',
  intent: 'Record that a campaign has been queued, and to how many people',
  mutation: {
    op: 'update',
    table: 'campaigns',
    set: { state: 'sent', queued_count: { $context: 'queuedCount' }, sent_at: { $context: 'sentAt' } },
    where: { and: [{ eq: ['campaigns.id', { $context: 'campaignId' }] }, { eq: ['campaigns.state', 'sending'] }] },
  },
};

export const campaignRefuse: MutationEntry = {
  fingerprint: 'campaigns/refuse',
  intent: 'Record that a campaign did not go out, and say why in words',
  mutation: {
    op: 'update',
    table: 'campaigns',
    set: { state: 'refused', refused_reason: { $context: 'reason' } },
    where: { and: [{ eq: ['campaigns.id', { $context: 'campaignId' }] }, { eq: ['campaigns.state', 'sending'] }] },
  },
};
