import type { CacheEntry, MutationEntry } from './index';
import { dateText, pattern } from '@lyra/app/prisms/format.prism';

const row = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name] } });

// ─── what is due ─────────────────────────────────────────────

export const trialsDue: CacheEntry = {
  fingerprint: 'automation/trials-due',
  intent: 'People at this studio whose free trial ends on or before a given date',
  shape: [{ studio_person_id: '', person_name: '', person_id: '', trial_ends_on: '' }],
  dsl: {
    from: ['studio_people', 'people'],
    fields: [
      { field: 'studio_people.id', as: 'studio_person_id' },
      'studio_people.trial_ends_on',
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
      'people.email',
    ],
    filter: {
      and: [
        { isNotNull: 'studio_people.trial_ends_on' },
        { lte: ['studio_people.trial_ends_on', { $context: 'cutoff' }] },
        // A window, so "ending soon" and "just ended" are two settings of one
        // selection rather than two reads.
        { gte: ['studio_people.trial_ends_on', { $context: 'from' }] },
      ],
    },
    sort: [{ field: 'studio_people.trial_ends_on', dir: 'asc' }],
  },
};

// ── who just joined ──────────────────────────────────────────
// Joining IS a subscription row landing, and the write fact off the vex
// bridge carries that row. What the effect needs is the PERSON behind it, so
// the reflex's selection anchors on the fact's own id and enriches — and in
// doing so RE-CHECKS reality under the automation's own principal: a
// subscription cancelled between the write and the run selects zero rows,
// which is a welcome email that correctly never sends.
export const joinedSubscription: CacheEntry = {
  fingerprint: 'automation/joined-subscription',
  intent: 'One new subscription, with the person behind it',
  shape: [{ subscription_id: '', person_name: '', person_id: '', email: '' }],
  dsl: {
    from: ['subscriptions', 'people'],
    fields: [
      { field: 'subscriptions.id', as: 'subscription_id' },
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
      'people.email',
    ],
    filter: { and: [{ eq: ['subscriptions.id', { $context: 'subscriptionId' }] }, { eq: ['subscriptions.status', 'active'] }] },
  },
};

// ── somebody asked ───────────────────────────────────────────
// An enquiry is a person the studio now KNOWS who holds nothing yet — the
// anchor row appearing is the moment. The holding-nothing filter is the
// guard, unchanged in meaning from the day it was written: an anchor written
// in the same breath as a subscription holds something by the time this
// selection runs, selects zero rows, and is not greeted as an enquiry.
export const enquiredPerson: CacheEntry = {
  fingerprint: 'automation/enquired-person',
  intent: 'One newly written-down person, if they still hold nothing',
  shape: [{ studio_person_id: '', person_name: '', person_id: '', email: '' }],
  dsl: {
    from: ['studio_people', 'people'],
    fields: [
      { field: 'studio_people.id', as: 'studio_person_id' },
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
      'people.email',
    ],
    // Holding nothing, read off the anchor's own mirrors (schema.ts) — no
    // reach into tables this rung has no business reading.
    filter: {
      and: [
        { eq: ['studio_people.id', { $context: 'studioPersonId' }] },
        { eq: ['studio_people.held_subscriptions', 0] },
        { eq: ['studio_people.works_here', false] },
        { eq: ['studio_people.deals_here', false] },
      ],
    },
  },
};

export const membersLapsedAway: CacheEntry = {
  fingerprint: 'automation/not-seen-since',
  intent: 'Active members with no attended class since a cutoff',
  shape: [{ subscription_id: '', person_id: '', person_name: '', started_on: '' }],
  dsl: {
    // `studio_people` IS JOINED RATHER THAN CORRELATED, and that is not a
    // stylistic preference — it is the difference between consent that works
    // and consent that goes stale. vex derives a cached read's dependencies
    // from the tables in `from` (handler.ts, collectTables), recursing into
    // subquery SOURCES and not into a filter's EXISTS. A consent test written
    // as a correlated EXISTS is a test on a table this entry does not appear
    // to read: somebody opts out, nothing invalidates, and the next run
    // selects them from cache. Joined here, the opt-out invalidates the
    // answer the same way any other write does.
    from: ['subscriptions', 'people', 'studio_people'],
    fields: [
      { field: 'subscriptions.id', as: 'subscription_id' },
      'subscriptions.started_on',
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
      'people.email',
    ],
    filter: {
      and: [
        { eq: ['subscriptions.status', 'active'] },
        // ── THE OPT-IN, AND IT IS PART OF THE QUESTION ──────────
        //
        // Not a filter the effect applies afterwards, and not a rule each
        // studio's automation has to remember: winning somebody back is
        // marketing under AT/DE law, so "who should we miss" MEANS "who has
        // said we may write to them". Somebody who never opted in selects
        // zero rows, which is a message that correctly never exists — no
        // outbox row, nothing to unsubscribe from, nothing to explain.
        //
        // Correlated the same way the attendance test below is, because there
        // is no foreign key from a subscription to the anchor: the pair
        // (person, studio) is what ties them.
        { eq: ['studio_people.marketing_ok', true] },
        // The anchor belongs to the same relationship the subscription does.
        // Stated rather than assumed: a join derived from `people` alone would
        // pair a member with their anchor at ANOTHER studio, and the person
        // known to two studios (the physio both gyms use) is seeded precisely
        // so that mistake has somewhere to show up.
        { eq: ['studio_people.person_id', 'subscriptions.person_id'] },
        { eq: ['studio_people.studio_id', 'subscriptions.studio_id'] },
        {
          not: {
            exists: {
              from: ['bookings', 'class_sessions'],
              filter: {
                and: [
                  // The correlation: this member's bookings, not everybody's.
                  { eq: ['bookings.person_id', 'subscriptions.person_id'] },
                  { eq: ['bookings.studio_id', 'subscriptions.studio_id'] },
                  { eq: ['bookings.attended', true] },
                  { gte: ['class_sessions.held_on', { $context: 'cutoff' }] },
                ],
              },
            },
          },
        },
      ],
    },
    sort: [{ field: 'subscriptions.started_on', dir: 'asc' }],
  },
};

export const bookingsOnDay: CacheEntry = {
  fingerprint: 'automation/bookings-on-day',
  intent: 'Booked classes at this studio on a given day, with who is coming',
  shape: [{ booking_id: '', person_id: '', person_name: '', class_name: '', starts_at: '' }],
  dsl: {
    from: ['bookings', 'class_sessions', 'people'],
    fields: [
      { field: 'bookings.id', as: 'booking_id' },
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
      'people.email',
      { field: 'class_sessions.name', as: 'class_name' },
      'class_sessions.starts_at',
    ],
    filter: {
      and: [
        { eq: ['bookings.status', 'booked'] },
        { eq: ['class_sessions.status', 'scheduled'] },
        { eq: ['class_sessions.held_on', { $context: 'day' }] },
      ],
    },
    sort: [{ field: 'class_sessions.starts_at', dir: 'asc' }],
  },
};

export const followUpsOpen: CacheEntry = {
  fingerprint: 'automation/follow-ups',
  intent: 'Follow-ups this studio has not done yet, soonest first',
  shape: [{ follow_up_id: '', person_name: '', title: '', detail: '', due_display: '', due_on: '', overdue: false, due_tone: '' }],
  dsl: {
    from: ['notifications', 'people'],
    fields: [
      { field: 'notifications.id', as: 'follow_up_id' },
      'notifications.title',
      'notifications.detail',
      'notifications.due_on',
      { field: 'people.name', as: 'person_name' },
    ],
    // Decided by the engine against the studio's own day: a browser must not be
    // the thing that says what "today" is.
    compute: {
      overdue: {
        case: { when: [{ condition: { lt: ['notifications.due_on', { $scope: 'today' }] }, then: true }], else: false },
      },
    },
    filter: { eq: ['notifications.done', false] },
    sort: [{ field: 'notifications.due_on', dir: 'asc' }],
    limit: 100,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        follow_up_id: row('follow_up_id'),
        // A follow-up about the studio has no person, and an empty cell reads
        // as a bug.
        person_name: { $case: { branches: [{ when: row('person_name'), then: row('person_name') }], else: 'The studio' } },
        title: row('title'),
        detail: row('detail'),
        due_on: row('due_on'),
        due_display: dateText(row('due_on')),
        overdue: row('overdue'),
        due_tone: { $case: { branches: [{ when: row('overdue'), then: 'alert' }], else: 'neutral' } },
      },
    },
  },
};

// What went, and what did not, and why not — the third of those being the
// whole reason the columns exist. A studio that cannot see why nothing
// arrived asks us instead, every time.
export const outboxRecent: CacheEntry = {
  fingerprint: 'automation/outbox',
  intent: 'Messages this studio’s automations have sent, and the ones that did not go',
  shape: [{ message_id: '', to_address: '', detail: '', subject: '', body: '', created_on: '', state_label: '', state_tone: '', can_send_again: false }],
  dsl: {
    from: ['outbox'],
    fields: [
      { field: 'outbox.id', as: 'message_id' },
      'outbox.to_address',
      'outbox.subject',
      'outbox.body',
      'outbox.state',
      'outbox.failed_reason',
      // Carried but not printed: it is what support is quoted, not something a
      // studio owner reads down a column.
      'outbox.provider_message_id',
      'outbox.created_on',
    ],
    sort: [{ field: 'outbox.created_at', dir: 'desc' }],
    limit: 50,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        message_id: row('message_id'),
        to_address: row('to_address'),
        provider_message_id: row('provider_message_id'),
        // A FAILED row is the only one worth offering again. Anything else is
        // on its way, or has already arrived.
        can_send_again: { $case: { branches: [{ when: { $eq: [row('state'), 'failed'] }, then: true }], else: false } },
        // THE LINE UNDER THE SUBJECT. Normally who it went to, which is what
        // somebody scanning the list wants. On a row that did not go, the
        // address is the least interesting thing about it — so the reason
        // rides beside it, in the provider's own words.
        detail: {
          $case: {
            branches: [{ when: row('failed_reason'), then: { $join: { parts: [row('to_address'), ' — ', row('failed_reason')], sep: '' } } }],
            else: row('to_address'),
          },
        },
        subject: row('subject'),
        body: row('body'),
        created_on: row('created_on'),
        state_label: {
          $case: {
            branches: [
              { when: { $eq: [row('state'), 'sent'] }, then: 'Sent' },
              { when: { $eq: [row('state'), 'failed'] }, then: 'Failed' },
              // It has been claimed and is on its way out. Brief, and real:
              // a row can genuinely be seen in this state.
              { when: { $eq: [row('state'), 'sending'] }, then: 'Sending' },
            ],
            // Not "Pending": nothing is working on it yet, and the word has to
            // be true.
            else: 'Not sent',
          },
        },
        state_tone: {
          $case: {
            branches: [
              { when: { $eq: [row('state'), 'sent'] }, then: 'good' },
              { when: { $eq: [row('state'), 'failed'] }, then: 'alert' },
              { when: { $eq: [row('state'), 'sending'] }, then: 'neutral' },
            ],
            else: 'warn',
          },
        },
      },
    },
  },
};

// ─── what they do ────────────────────────────────────────────

export const closeFollowUp: MutationEntry = {
  fingerprint: 'automation/follow-up-done',
  intent: 'Mark a follow-up done',
  mutation: {
    op: 'update',
    table: 'notifications',
    set: { done: { $context: 'done' } },
    where: { eq: ['notifications.id', { $context: 'followUpId' }] },
  },
};

// ── the message, and the studio it goes out as ───────────────
//
// THE ENVELOPE IS COMPOSED HERE, and that is the whole reason this entry
// exists. The transport reads nothing — no pool, no vex, no identity — so
// everything a message needs to leave the building has to arrive with it, and
// the only honest place to assemble that is a selection running as the
// studio's own automation principal, under the tenant boundary the engine
// already draws.
//
// It is anchored on the fact's own row and it RE-READS THE STATE: a message
// already claimed, already sent, or belonging to another studio selects zero
// rows, which is a send that correctly never happens. The channel filter is
// not decoration either — an SMS row reaching a mail transport is a message
// delivered to nobody, silently.
export const outboxQueued: CacheEntry = {
  fingerprint: 'automation/outbox-queued',
  intent: 'One queued message, with the studio whose name it goes out in',
  shape: [{ message_id: '', to_address: '', subject: '', body: '', from_name: '', from_box: '', reply_to: '', marketing: false, person_id: '', studio_id: '', suppressed: false, sending_domain: '', sending_domain_ok: false, daily_cap: 0 }],
  dsl: {
    from: ['outbox', 'studios'],
    fields: [
      { field: 'outbox.id', as: 'message_id' },
      'outbox.to_address',
      'outbox.subject',
      'outbox.body',
      // The three the wire needs beyond the words: whether this earns an
      // unsubscribe footer, and who to address that link to.
      'outbox.marketing',
      'outbox.person_id',
      'outbox.studio_id',
      // The studio's name is what a member sees it is from; the slug is the box
      // before our sending domain; the reply address is what makes an answer
      // reach the studio rather than us.
      { field: 'studios.name', as: 'from_name' },
      { field: 'studios.slug', as: 'from_box' },
      { field: 'studios.reply_to', as: 'reply_to' },
      // Empty unless the provider has verified it — see studios.sending_domain_ok.
      { field: 'studios.sending_domain', as: 'sending_domain' },
      { field: 'studios.sending_domain_ok', as: 'sending_domain_ok' },
      { field: 'studios.daily_mail_cap', as: 'daily_cap' },
    ],
    // SUPPRESSED IS ANSWERED, NOT FILTERED. Dropping the row from the answer
    // would leave it `queued` for a reader that never comes; carrying the fact
    // lets the effect record why it stopped, where a studio can read it.
    compute: {
      suppressed: {
        case: {
          when: [
            {
              condition: {
                exists: {
                  from: ['mail_suppressions'],
                  filter: {
                    and: [
                      { eq: ['mail_suppressions.address', 'outbox.to_address'] },
                      // Empty scope is everybody (a dead address); otherwise it
                      // is this studio's own complaint.
                      { or: [{ eq: ['mail_suppressions.studio_id', ''] }, { eq: ['mail_suppressions.studio_id', 'outbox.studio_id'] }] },
                    ],
                  },
                },
              },
              then: true,
            },
          ],
          else: false,
        },
      },
    },
    filter: {
      and: [
        { eq: ['outbox.id', { $context: 'messageId' }] },
        { eq: ['outbox.state', 'queued'] },
        { eq: ['outbox.channel', 'email'] },
      ],
    },
  },
};

// ── the claim ────────────────────────────────────────────────
//
// THE ONE WRITE THAT MAKES SENDING SAFE. Tide retries a failed task, and the
// case that bites is not a failure: the provider accepted the message and the
// acknowledgement did not come back inside the timeout. The retry would send
// it again — to a person, who would receive two.
//
// So the effect takes the row before it sends, and the WHERE is the whole
// mechanism: `state = 'queued'` is what makes this lose when somebody else has
// already won. An empty answer means "not mine", and the effect stops.
export const outboxClaim: MutationEntry = {
  fingerprint: 'outbox/claim',
  intent: 'Take a queued message, so that only one attempt can send it',
  mutation: {
    op: 'update',
    table: 'outbox',
    // The timestamp is written by the same statement that takes the row, and
    // that is the whole point of it: a claim recorded a moment later is a claim
    // that is missing exactly when the process died.
    set: { state: 'sending', claimed_at: { $context: 'claimedAt' } },
    // QUEUED, OR ABANDONED. The second half is what makes a stranded row
    // recoverable: a process that dies between claiming and recording leaves a
    // row saying `sending` that no state can distinguish from one that is
    // genuinely in flight — only its AGE can. Past the threshold the claim
    // takes it back, which is why `claimed_at` is written by this statement
    // and not a moment later.
    where: {
      and: [
        { eq: ['outbox.id', { $context: 'messageId' }] },
        {
          or: [
            { eq: ['outbox.state', 'queued'] },
            { and: [{ eq: ['outbox.state', 'sending'] }, { lt: ['outbox.claimed_at', { $context: 'abandonedBefore' }] }] },
          ],
        },
      ],
    },
  },
};

export const outboxSent: MutationEntry = {
  fingerprint: 'outbox/record-sent',
  intent: 'Record that a message left, and what the provider called it',
  mutation: {
    op: 'update',
    table: 'outbox',
    set: {
      state: 'sent',
      // WHAT SUPPORT IS QUOTED. Recording `sent` with nothing to look up is
      // the state nobody can act on the morning somebody asks where it went.
      provider_message_id: { $context: 'providerMessageId' },
      sent_at: { $context: 'sentAt' },
      failed_reason: '',
    },
    where: { eq: ['outbox.id', { $context: 'messageId' }] },
  },
};

// TWO OUTCOMES, TWO ENTRIES, AND THE STATES ARE LITERAL.
//
// ⟲ These were one entry taking its state from context, which read as tidy and
// was not: a fingerprint called `record-unsent` that could write 'sent' holds
// more authority than its name admits, and a charter grant is table.verb — it
// cannot tell two updates on `outbox` apart. Anything holding the pen for one
// held it for the other. The name is now the whole of what each can do.
export const outboxFailed: MutationEntry = {
  fingerprint: 'outbox/record-failed',
  intent: 'Record that a message did not go, and why',
  mutation: {
    op: 'update',
    table: 'outbox',
    set: { state: 'failed', failed_reason: { $context: 'failedReason' } },
    where: { eq: ['outbox.id', { $context: 'messageId' }] },
  },
};

// Back in the queue for the retry the reflex's own policy provides, with the
// reason kept so the row says what went wrong while it waits. Whether a
// failure earns this or `record-failed` is decided by WHY it did not go — a
// refused address will be refused again, an unreachable host might not be —
// and the transport draws that line (`retry`), not this entry.
export const outboxRequeue: MutationEntry = {
  fingerprint: 'outbox/requeue',
  intent: 'Put a message back in the queue after an attempt that may yet work',
  mutation: {
    op: 'update',
    table: 'outbox',
    set: { state: 'queued', failed_reason: { $context: 'failedReason' } },
    where: { eq: ['outbox.id', { $context: 'messageId' }] },
  },
};

// The row records exactly what will go out; the reflex below it does the
// sending. See `outboxQueued` for how it acquires a sender.
export const queueMessage: MutationEntry = {
  fingerprint: 'automation/queue-message',
  intent: 'Queue an email for a person, to be sent when the outbox reflex wakes',
  mutation: {
    op: 'insert',
    table: 'outbox',
    values: {
      person_id: { $context: 'personId' },
      to_address: { $context: 'toAddress' },
      subject: { $context: 'subject' },
      body: { $context: 'body' },
      source: { $context: 'source' },
      marketing: { $context: 'marketing' },
    },
  },
};

export const notify: MutationEntry = {
  fingerprint: 'automation/notify',
  intent: 'Record something an automation or an installed integration wants the studio to know',
  // A PUBLISHED interface: the belts and stripe integrations replay this by name, so
  // the fingerprint stays put while the table under it got its honest name.
  // Landing a row here also fans out over the socket to the studio's
  // connected staff — see the app's onMutation hook (app.ts).
  mutation: {
    op: 'insert',
    table: 'notifications',
    values: {
      person_id: { $context: 'personId' },
      title: { $context: 'subject' },
      detail: { $context: 'body' },
      source: { $context: 'kind' },
    },
  },
};

// ── the bell ─────────────────────────────────────────────────

export const notificationsUnseen: CacheEntry = {
  fingerprint: 'notifications/unseen-count',
  intent: 'How many open notifications this studio has not read yet',
  shape: { total: 0 },
  dsl: {
    from: ['notifications'],
    aggregate: { total: { count: 'notifications.id' } },
    // Open AND unread — the same rows the Notices list shows, so the badge
    // can always reach zero by reading the list it points at.
    filter: { and: [{ eq: ['notifications.seen', false] }, { eq: ['notifications.done', false] }] },
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: { total: { $get: { from: { $var: 'r' }, path: ['total'], fallback: { $const: 0 } } } },
    },
  },
};

// Reading marks exactly the ROWS THE SCREEN SHOWED — the caller names the ids
// off its own list, which is both what the authoring lint demands of an
// update (a caller-bounded WHERE) and the honest claim: you have seen what
// was in front of you, not whatever landed while you were reading it. The
// flag is all a screen may say; WHEN is the trigger's.
export const notificationsMarkSeen: MutationEntry = {
  fingerprint: 'notifications/seen',
  intent: 'Mark the notifications somebody has on screen as read',
  mutation: {
    op: 'update',
    table: 'notifications',
    set: { seen: true },
    where: {
      and: [
        { eq: ['notifications.seen', false] },
        { in: ['notifications.id', { $context: 'ids' }] },
      ],
    },
  },
};

// ─── the automations as rows ─────────────────────────────────
//
// THE WHOLE CARD, IN ONE ENTRY. The screen used to be built by a function:
// two hand-written SELECTs, a lookup into the shipped constants, and every
// label composed in JavaScript. All of it is here now — the vocabulary is
// joined by foreign key, the sentence and the state words are composed in
// the mapping, and the tenant boundary is the engine's rather than a WHERE
// somebody remembered to type.
//
// `last_run_*` are mirror columns the engine's ledger pushes (boot.ts): the
// ledger is keyed by a composed reflex id, so it is the one thing here that
// could not be a join.
export const automationsList: CacheEntry = {
  fingerprint: 'automations/list',
  intent: 'The automations this studio has set up, as the cards that show them',
  shape: [{ automation_id: '', sentence: '', intent: '', run_display: '', watched: false, state_label: '', state_tone: '', last_run: '' }],
  dsl: {
    from: ['automations', 'automation_moments', 'automation_effects'],
    fields: [
      { field: 'automations.id', as: 'automation_id' },
      'automations.studio_id',
      'automations.moment',
      'automations.effect',
      'automations.subject',
      'automations.body',
      'automations.enabled',
      'automations.run_at',
      'automations.days',
      'automations.last_run_state',
      'automations.last_run_done',
      'automations.last_run_failed',
      { field: 'automation_moments.phrase', as: 'moment_phrase' },
      { field: 'automation_moments.blurb', as: 'moment_blurb' },
      { field: 'automation_moments.watched', as: 'watched' },
      { field: 'automation_moments.days_label', as: 'days_label' },
      { field: 'automation_effects.phrase', as: 'effect_phrase' },
      { field: 'automation_effects.blurb', as: 'effect_blurb' },
      { field: 'automation_effects.subject_label', as: 'subject_label' },
      { field: 'automation_effects.body_label', as: 'body_label' },
      { field: 'automation_effects.message_hint', as: 'message_hint' },
    ],
    sort: [{ field: 'automation_moments.sort', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        automation_id: row('automation_id'),
        // The reflex id the engine knows this by, composed the same way
        // `reflexIdFor` composes it — the ledger and the screen agree because
        // both build it from the same two columns.
        reflex_id: { $join: { parts: [row('studio_id'), ':', row('automation_id')], sep: '' } },
        moment: row('moment'),
        effect: row('effect'),
        subject: row('subject'),
        body: row('body'),
        enabled: row('enabled'),
        run_at: row('run_at'),
        days: row('days'),
        // THE SENTENCE, composed rather than stored: it is what the row does,
        // in the operator's language, so it stays true when either half moves.
        // A PATTERN, not a join — the frame translates whole and the fragment
        // slots go through the book themselves. And spelled `sentence`, not
        // `name`: `name` is deliberately no prose key (people are named), so
        // this sentence filed under it was invisible to the language pass.
        sentence: pattern('When {moment}, {effect}', { moment: row('moment_phrase'), effect: row('effect_phrase') }),
        // The MOMENT's blurb alone. The card is a list of things that happen,
        // read at a glance; what the effect is like belongs in the form, where
        // somebody is choosing one. Joining both here turns every card into
        // two paragraphs saying the same thing about email.
        intent: row('moment_blurb'),
        // A watched moment has no hour, and a row claiming one it ignores lies.
        run_display: { $case: { branches: [{ when: row('watched'), then: 'As it happens' }], else: pattern('Every day at {time}', { time: row('run_at') }) } },
        watched: row('watched'),
        // The pairing's shape, carried on the row — "Edit" hands it straight
        // to the form, which then has nothing to ask anybody.
        moment_phrase: row('moment_phrase'),
        moment_blurb: row('moment_blurb'),
        effect_phrase: row('effect_phrase'),
        effect_blurb: row('effect_blurb'),
        days_label: row('days_label'),
        uses_days: { $case: { branches: [{ when: row('days_label'), then: true }], else: false } },
        uses_message: { $case: { branches: [{ when: row('subject_label'), then: true }], else: false } },
        subject_label: row('subject_label'),
        body_label: row('body_label'),
        message_hint: row('message_hint'),
        state_label: { $case: { branches: [{ when: row('enabled'), then: 'Armed' }], else: 'Paused' } },
        state_tone: { $case: { branches: [{ when: row('enabled'), then: 'good' }], else: 'neutral' } },
        // The card shows Pause OR Arm, never both — `hideKey`/`showKey` read
        // this rather than the layout branching on a role or a state.
        paused: { $case: { branches: [{ when: row('enabled'), then: false }], else: true } },
        facts: [
          {
            label: 'Last run',
            value: {
              $case: {
                branches: [
                  { when: { $eq: [row('last_run_state'), 'settled'] }, then: { $join: { parts: [row('last_run_done'), ' done'], sep: '' } } },
                  { when: row('last_run_state'), then: row('last_run_state') },
                ],
                else: 'Never',
              },
            },
          },
        ],
        failed: row('last_run_failed'),
      },
    },
  },
};

// ─── the recipes, against what this studio already runs ──────
//
// A recipe is an app constant; whether THIS studio runs it is a row. The
// join is the point: `installed` is an EXISTS correlated on the studio the
// engine stamped, so the answer is per-tenant without the entry naming a
// tenant. The studio's own words win where they have any — "Change it" has
// to open their automation, their hour, not the recipe's suggestion.
export const automationRecipes: CacheEntry = {
  fingerprint: 'automations/recipes',
  intent: 'The recipes this app ships, marked with the ones this studio already runs',
  shape: [{ id: '', title: '', why: '', icon: '', moment: '', effect: '', sentence: '', installed: false, state_label: '', state_tone: '' }],
  dsl: {
    from: ['automation_recipes', 'automation_moments', 'automation_effects'],
    fields: [
      'automation_recipes.id',
      'automation_recipes.title',
      'automation_recipes.why',
      'automation_recipes.icon',
      'automation_recipes.moment',
      'automation_recipes.effect',
      { field: 'automation_recipes.run_at', as: 'recipe_run_at' },
      { field: 'automation_recipes.days', as: 'recipe_days' },
      { field: 'automation_recipes.subject', as: 'recipe_subject' },
      { field: 'automation_recipes.body', as: 'recipe_body' },
      { field: 'automation_moments.phrase', as: 'moment_phrase' },
      { field: 'automation_moments.blurb', as: 'moment_blurb' },
      { field: 'automation_moments.watched', as: 'watched' },
      { field: 'automation_moments.days_label', as: 'days_label' },
      { field: 'automation_effects.phrase', as: 'effect_phrase' },
      { field: 'automation_effects.blurb', as: 'effect_blurb' },
      { field: 'automation_effects.subject_label', as: 'subject_label' },
      { field: 'automation_effects.body_label', as: 'body_label' },
      { field: 'automation_effects.message_hint', as: 'message_hint' },
    ],
    compute: {
      installed: {
        case: {
          when: [
            {
              condition: {
                exists: {
                  from: ['automations'],
                  filter: {
                    and: [
                      { eq: ['automations.moment', 'automation_recipes.moment'] },
                      { eq: ['automations.effect', 'automation_recipes.effect'] },
                    ],
                  },
                },
              },
              then: true,
            },
          ],
          else: false,
        },
      },
    },
    sort: [{ field: 'automation_recipes.sort', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        id: row('id'),
        title: row('title'),
        why: row('why'),
        icon: row('icon'),
        moment: row('moment'),
        effect: row('effect'),
        sentence: pattern('When {moment}, {effect}', { moment: row('moment_phrase'), effect: row('effect_phrase') }),
        run_at: row('recipe_run_at'),
        days: row('recipe_days'),
        subject: row('recipe_subject'),
        body: row('recipe_body'),
        moment_phrase: row('moment_phrase'),
        moment_blurb: row('moment_blurb'),
        effect_phrase: row('effect_phrase'),
        effect_blurb: row('effect_blurb'),
        watched: row('watched'),
        days_label: row('days_label'),
        uses_days: { $case: { branches: [{ when: row('days_label'), then: true }], else: false } },
        uses_message: { $case: { branches: [{ when: row('subject_label'), then: true }], else: false } },
        subject_label: row('subject_label'),
        body_label: row('body_label'),
        message_hint: row('message_hint'),
        installed: row('installed'),
        // A recipe a studio already runs is not an offer — saying so beats
        // letting them add it and hit a unique-constraint error.
        // The title slot is itself vocabulary (the seeded recipe titles), so
        // it translates inside its frame.
        heading: { $case: { branches: [{ when: row('installed'), then: row('title') }], else: pattern('Set up: {title}', { title: row('title') }) } },
        state_label: { $case: { branches: [{ when: row('installed'), then: 'Running' }], else: 'Not set up' } },
        state_tone: { $case: { branches: [{ when: row('installed'), then: 'good' }], else: 'neutral' } },
      },
    },
  },
};

export const automationRuns: CacheEntry = {
  fingerprint: 'automations/runs',
  intent: 'How this studio’s automations have most recently run',
  shape: [{ reflex_id: '', state: '', total: 0, done: 0, failed: 0, created_at: 0 }],
  dsl: {
    from: ['tide_run'],
    fields: ['tide_run.reflex_id', 'tide_run.state', 'tide_run.total', 'tide_run.done', 'tide_run.failed', 'tide_run.created_at'],
    sort: [{ field: 'tide_run.created_at', dir: 'desc' }],
    limit: 200,
  },
};

export const automationCreate: MutationEntry = {
  fingerprint: 'automations/create',
  intent: 'Set up an automation, or re-word the one this studio already runs',
  mutation: {
    op: 'insert',
    table: 'automations',
    // Both are foreign keys into the shipped vocabulary, so a row can combine
    // what the app ships and cannot name anything it does not.
    values: {
      moment: { $context: 'moment' },
      effect: { $context: 'effect' },
      run_at: { $context: 'runAt' },
      days: { $context: 'days' },
      subject: { $context: 'subject' },
      body: { $context: 'body' },
    },
    // A PAIRING IS UNIQUE PER STUDIO, so setting one up twice is setting it
    // up once and changing it. Saving a recipe a studio already runs used to
    // need the id of their existing row carried all the way through the
    // screen; the natural key was there the whole time, and the constraint
    // that was going to refuse the second insert now resolves it instead.
    onConflict: {
      target: ['studio_id', 'moment', 'effect'],
      set: {
        run_at: { $context: 'runAt' },
        days: { $context: 'days' },
        subject: { $context: 'subject' },
        body: { $context: 'body' },
      },
    },
  },
};

// Pause and arm, as one flag on the row. The write lands through vex, so the
// reflex reload rides the app's `automations` reaction — no screen remembers
// to poke anything, and the raw UPDATE this replaced is gone with the fn
// that held it.
export const automationArm: MutationEntry = {
  fingerprint: 'automations/arm',
  intent: 'Pause an automation, or arm it again',
  mutation: {
    op: 'update',
    table: 'automations',
    set: { enabled: { $context: 'enabled' } },
    where: { eq: ['automations.id', { $context: 'automationId' }] },
  },
};

export const automationUpdate: MutationEntry = {
  fingerprint: 'automations/update',
  intent: 'Change when an automation runs, or its window',
  mutation: {
    op: 'update',
    table: 'automations',
    set: {
      run_at: { $context: 'runAt' },
      days: { $context: 'days' },
      subject: { $context: 'subject' },
      body: { $context: 'body' },
      enabled: { $context: 'enabled' },
    },
    where: { eq: ['automations.id', { $context: 'automationId' }] },
  },
};

// ── THE ONES NOBODY IS COMING BACK FOR ───────────────────────
//
// Two shapes, one question: which of this studio's messages are still not out?
//
//   `sending`, claimed long ago — a process died mid-send. Nothing else can
//   free these: the insert fact that woke the dispatcher was consumed, and no
//   state distinguishes abandoned from in-flight without an age.
//   `queued`, older than the window — the dispatcher never got to it, or a
//   human pressed Retry on a failed row and put it back.
//
// Deliberately NOT `failed`: that is a decision somebody or something already
// made, and a sweep that re-sent failures would re-send a bounce forever.
// ONE ENVELOPE, TWO QUESTIONS. The dispatcher asks "this row, is it still
// sendable"; the sweep asks "what did this studio never send". They must hand
// the effect the SAME shape or the second one mails an empty message — so the
// shape is written once and the filter is what differs.
export const outboxStuck: CacheEntry = {
  fingerprint: 'automation/outbox-stuck',
  intent: 'Messages this studio queued that never went out',
  shape: outboxQueued.shape,
  dsl: {
    ...outboxQueued.dsl,
    filter: {
      and: [
        { eq: ['outbox.channel', 'email'] },
        // Deliberately NOT `failed`: that is a decision something already made,
        // and a sweep that re-sent failures would re-send a bounce forever.
        // `sending` is the abandoned case — a process that died mid-send —
        // which only an age can tell apart from one genuinely in flight.
        { in: ['outbox.state', ['queued', 'sending']] },
        { lt: ['outbox.created_at', { $context: 'stuckBefore' }] },
      ],
    },
    sort: [{ field: 'outbox.created_at', dir: 'asc' }],
    limit: 200,
  },
};
