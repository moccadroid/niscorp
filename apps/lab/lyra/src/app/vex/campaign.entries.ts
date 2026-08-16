import type { CacheEntry, MutationEntry } from './index';
import type { ComputeExpression, Filter } from '@niscorp/vex';
import { LENSES, HOLDINGS } from './member.entries';
import { dateText, pattern } from '@lyra/app/prisms/format.prism';

const row = (name: string) => ({ $get: { from: { $var: 'c' }, path: [name] } });
const num = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name], fallback: { $const: 0 } } });

// ═══════════════════════════════════════════════════════════════
// WHO A STUDIO MAY WRITE TO, AND WHAT IS TRUE OF EACH OF THEM.
//
// THE AUDIENCE IS THE QUESTION, NOT THE NAMES. A campaign stores which
// question was asked and who the owner struck off by hand; the recipients are
// resolved by re-asking it at the moment of writing. That is not a
// convenience — a roll that pages at fifty cannot BE ticked into an audience
// of four hundred, and a list of names captured ninety seconds ago is a list
// that can no longer answer "did they opt out since".
//
// EVERY QUESTION HERE ANSWERS A DISPOSITION RATHER THAN FILTERING ON IT, and
// that is the difference between this file and `automation/not-seen-since`.
// An automation is right to select nobody it cannot write to: an unsendable
// message is a message that correctly never exists. A COMPOSE SHEET IS NOT —
// "39 will be written to, 2 have opted out" is a sentence that cannot be said
// by a query which already dropped the two. It is the same doctrine the
// dispatch read keeps for suppression, in the same words: SUPPRESSED IS
// ANSWERED, NOT FILTERED (tide.entries.ts).
//
// So the disposition is a computed column here, and the WRITE restates it as
// a filter (see `campaignAudienceResolve`) — because no dialect allows an
// alias in WHERE, and because the write must not depend on the screen having
// asked nicely.
// ═══════════════════════════════════════════════════════════════

const lensNamed = (name: string): Filter | undefined => LENSES.find((l) => l.lens === name)?.condition;
const holdingNamed = (name: string): Filter | undefined => HOLDINGS.find((h) => h.holding === name)?.condition;

/** An audience built from the roll's OWN two vocabularies, so that "everyone
 *  on a membership" means here exactly what it means on the People screen. A
 *  named pair cannot drift from the list it claims to be. */
const pair = (lens: string, holding: string): Filter => {
  const arms = [lensNamed(lens), holdingNamed(holding)].filter((c): c is Filter => c !== undefined);
  return arms.length === 1 && arms[0] !== undefined ? arms[0] : { and: arms };
};

/** Still paying, and has not attended anything since the cutoff. The
 *  attendance test is correlated for the reason the automation's is: there is
 *  no foreign key from an anchor to a booking, and the pair (person, studio)
 *  is what ties them. */
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

/** Leaving on a date already fixed — the people there is still time to talk
 *  to. `ends_on` in the future is what "notice given, not yet gone" means;
 *  `revenueAtRisk` asks it the same way. */
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

// ── THE CLOSED LIST ──────────────────────────────────────────
//
// Eight questions, and an owner chooses one. This is the whole of the
// "deleted concepts" argument made concrete: no list import, no field
// mapping, no segment builder, because the studio already thinks in these and
// the product already holds the answers.
//
// STAFF AND CONTACTS ARE DELIBERATELY ABSENT. A supplier and a physio are
// people the studio DEALS with; broadcasting an offer to them is not a
// feature somebody forgot. A ninth row here is a decision recorded in
// docs/plans/lyra-campaigns.md, with the consent and phrase obligations every
// row below already carries.
//
// `windowed` is the screen's question, not a nullable parameter: "gone quiet"
// is meaningless without "since when", and "everyone on trial" would be lied
// to by a window.
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

// ── ONE ARM PER QUESTION, GUARDED BY ITS NAME ────────────────
//
// The roll's pattern: `{ $context } = literal` binds the choice once and
// compares it to a constant, so exactly one arm can be live and an audience
// nobody declared matches nothing. Naming an audience is choosing from the
// list above, never writing a filter.
const AUDIENCE: Filter = {
  or: AUDIENCES.map((a) => ({ and: [{ eq: [{ $context: 'audience' }, a.id] }, a.condition] })),
};

// WHO THE OWNER STRUCK OFF. Optional, because unticking nobody is the
// ordinary case and an empty list is not a filter — the same posture the
// roll's search and cursor take.
const EXCEPT: Filter = { optional: { key: 'except', then: { notIn: ['studio_people.person_id', { $context: 'except' }] } } };

// EVERY CALLER SENDS `cutoff`, INCLUDING THE ONES THAT DO NOT USE IT, and
// that is not the sentinel it looks like. The windowed arms consult it; the
// others never reach it because their guard is false. Making it OPTIONAL is
// what would be dangerous: an absent key drops the condition it wraps, so
// "gone quiet" with no window would stop meaning "gone quiet" and start
// meaning EVERY MEMBER — the one failure a file that decides who receives
// mail must not have.
const QUESTION: Filter = { and: [AUDIENCE, EXCEPT] };

// ── THE FOUR DISPOSITIONS, AS PREDICATES ─────────────────────
//
// Written once, here, and used three ways: ordered into a `case` for the
// column the sheet reads, ANDed into a filter for the write, and counted for
// the sentence. THE POINT IS THAT THERE IS ONE SOURCE — the failure this
// shape exists to prevent is a screen that promises 39 and a write that sends
// 37 because somebody edited one of two copies.
const HAS_ADDRESS: Filter = { isNotNull: 'studio_people.mail_to' };
const NO_ADDRESS: Filter = { isNull: 'studio_people.mail_to' };
const OPTED_IN: Filter = { eq: ['studio_people.marketing_ok', true] };
const ON_THE_LIST: Filter = {
  exists: {
    from: ['mail_suppressions'],
    filter: {
      and: [
        { eq: ['mail_suppressions.address', 'studio_people.mail_to'] },
        // Empty scope is everybody (a dead address); otherwise it is this
        // studio's own complaint. The bounce door's own rule.
        { or: [{ eq: ['mail_suppressions.studio_id', ''] }, { eq: ['mail_suppressions.studio_id', 'studio_people.studio_id'] }] },
      ],
    },
  },
};

/** Somebody there is no honest way to write to, and the reason — in the order
 *  the reasons have to be asked, because an address is what the other two are
 *  ABOUT and a person with none can be neither suppressed nor consenting.
 *  A `case` stops at its first true branch, so these stay bare. */
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

/** The same facts as a filter, because the WRITE cannot read a computed alias
 *  — no dialect allows one in a WHERE — and must not trust that a screen
 *  asked politely. */
const WRITABLE: Filter = { and: [HAS_ADDRESS, OPTED_IN, { not: ON_THE_LIST }] };

// ── THE TWO NUMBERS ON THE COMPOSE SHEET ─────────────────────
//
// "412 in this list — 397 will be written to."
//
// TWO ENTRIES RATHER THAN ONE ROW OF FOUR TALLIES, and the reason is the read
// grammar rather than taste: an `exists` resolves only in a query's OWN
// filter, so "how many are suppressed" cannot be a conditional sum beside
// "how many have no address" — the suppression test has to BE the filter of
// the query that counts it. A group-by does not rescue it either, since
// grouping resolves real columns and `disposition` is computed.
//
// So the numbers split by what each query can honestly ask, and the REASONS
// move to where they are more use anyway: `campaigns/audience-page` carries a
// disposition per person, so an owner reads "Jonas Weber — has not opted in"
// beside the name rather than "2 opted out" over a list of forty. The two
// counts are the whole truth about however many there are; the list is the
// first `UNTICK_LIMIT` of them.
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
        // Composed here because a layout binds values and cannot concatenate.
        total_display: pattern('{n} in this list', { n: num('total') }),
      },
    },
  },
};

/** THE NUMBER THE BUTTON IS ABOUT, and it is counted through the same filter
 *  the write uses — not through a tally of the screen's own reasoning. If
 *  these two ever disagree, the sheet has lied to somebody about mail that
 *  already went. */
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

/** How many names the untick list shows. Not a page with a cursor: this is a
 *  sheet, the count above tells the whole truth however long the list is, and
 *  a studio unticking their four-hundredth member wants a search, which is a
 *  screen decision nobody has asked for yet. */
export const UNTICK_LIMIT = 200;

export const campaignAudiencePage: CacheEntry = {
  fingerprint: 'campaigns/audience-page',
  intent: 'The people a question reaches, by name, with what is true of each',
  // NO ADDRESS IN THIS SHAPE, deliberately. The browser has no business
  // holding one: it is not shown, it is not needed to untick somebody, and a
  // read that carries it would put a studio's whole mailing list on the wire
  // to draw a list of first names.
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

// ── WHAT THE FAN-OUT ACTUALLY WRITES FROM ────────────────────
//
// `WRITABLE` rather than the computed disposition, because a write cannot
// read an alias and must enforce what the sheet advised rather than trust it.
//
// THIS IS NOT A SECRET READ, and claiming so would be theatre: a manager
// holds `people.read` and the roll already shows them every member's address.
// What it is, is the read the MACHINERY works from — and the reason
// `campaigns/audience-page` deliberately carries no address is different: a
// sheet drawing a list of first names has no reason to put a studio's entire
// mailing list on the wire to do it.
/**
 * ONE PAGE OF RECIPIENTS, AND THE REASON IT IS A PAGE.
 *
 * EVERY READ IN THIS ENGINE HAS A LIMIT WHETHER IT SAYS SO OR NOT: a DSL that
 * authors none is given `defaultLimit` (100) by the pipeline, and one that
 * authors more than `maxLimit` (1000) is clamped to it. That is a good rule —
 * an unbounded read is a mistake in every other entry here — and it is fatal
 * to exactly one kind of read, which is this one. A LIST THAT DECIDES WHO
 * RECEIVES MAIL CANNOT BE TRUNCATED: silently mailing the first hundred of
 * three hundred members is not a smaller version of the right answer, and the
 * campaign row would stamp it as a success.
 *
 * So the fan-out pages, and this entry says the page size out loud rather than
 * inheriting one. `after` is the seek — the sort is `person_id` ascending and
 * total, so the cursor is a single value and the next page is everybody above
 * it. Optional, so the first page sends no key at all.
 */
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

// ── TODAY'S CEILING, ON A RUNG THE SHEET CAN REACH ───────────
//
// `automation/sent-today` answers this already and lives on the automation
// rung, which a manager is not. Queued rows count here and do not there: a
// campaign's rows sit `queued` until dispatch claims them, so a sheet that
// counted only what had gone would let two campaigns in a minute both pass a
// ceiling neither of them fits under.
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

// ── WHAT WAS SENT, AND TO WHICH QUESTION ─────────────────────
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
        // The audience's own phrase, from its row — never prose stored on the
        // campaign, so the question an owner reads goes through the
        // phrasebook like every other sentence in the product.
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

/**
 * The row the fan-out reflex works from — read as machinery, by id.
 *
 * `state = 'sending'` is in the FILTER rather than checked afterwards, which
 * is what lets the reflex arm on any `campaigns` insert without caring: a
 * draft selects no row and wakes nothing, and a campaign somebody already
 * sent selects no row either.
 *
 * The studio's ceiling rides along because the join is free — a campaign
 * belongs to a studio — and because the alternative is a second read on a
 * rung that cannot see `studios` on its own surface.
 */
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

// ── the writes ───────────────────────────────────────────────

/** What a human's principal does when they press Send, and the whole of it.
 *  No mail is queued here — see the fan-out reflex, and see charter.ts on why
 *  `outbox` has no human writer. */
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

/**
 * N rows in ONE statement, and every column that varies by person is a
 * `$item`.
 *
 * NOT A `$lookup` FOR THE ADDRESS, and the reason is worth the line: a lookup
 * inside `insertEach` compiles once and is constant across rows (vex's
 * mutation grammar says so in as many words), so keying one by person would
 * put ONE person's address on every row. The addresses arrive already
 * resolved, from a read the same reflex just performed as the same principal
 * — which is also why no screen has ever seen one.
 *
 * ON CONFLICT with no `set` is DO NOTHING, arrested by
 * `outbox_campaign_person`: this statement is the thing a dying process
 * re-runs, and the index is what makes the re-run cost nothing instead of
 * costing everybody a second copy.
 */
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
      // NOT A TOGGLE ANYWHERE. Bulk mail from a list is marketing however
      // warmly it is worded, so the unsubscribe footer and the
      // List-Unsubscribe headers are not something a desk under pressure can
      // turn off by turning this off.
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

/** The ceiling saying no BEFORE any mail exists. A newsletter half-sent is
 *  worse than one visibly not sent, which is the whole reason this is checked
 *  at the source rather than left to dispatch's per-message refusal. */
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
