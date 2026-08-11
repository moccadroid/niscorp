import type { CacheEntry, MutationEntry } from './index';

// WHAT THE AUTOMATIONS ASK FOR, AND WHAT THEY DO.
//
// Nothing here is special. These are ordinary authored entries, replayed over
// the ordinary vex surface by a principal that happens never to log in — which
// is the point of wiring tide this way rather than handing it a database
// handle. A reflex's selection is a fingerprint the same as a screen's, so it
// is replay-only, scoped engine-side, and inspectable before it ever runs.
//
// The practical test: every `select` and every `effect` below would be refused
// for a principal whose charter did not grant it. An automation with a bug
// cannot exceed its rung, and neither can an automation somebody edits.

const row = (name: string) => ({ $get: { from: { $var: 'r' }, path: [name] } });

// ─── what is due ─────────────────────────────────────────────

// Trials that have run their course.
//
// The window is a parameter rather than a literal, so a studio that runs
// three-week trials changes a number on a row instead of asking for a release.
// `joined_on` is a date and vex has no date arithmetic, so the cutoff is
// computed by the caller and arrives as context — the same shape the timetable
// uses for its fortnight.
export const trialsDue: CacheEntry = {
  fingerprint: 'automation/trials-due',
  intent: 'Trialling memberships at this studio that started before a given date',
  shape: [{ membership_id: '', person_name: '', person_id: '', joined_on: '' }],
  dsl: {
    from: ['memberships', 'people'],
    fields: [
      { field: 'memberships.id', as: 'membership_id' },
      'memberships.joined_on',
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
    ],
    filter: {
      and: [
        { eq: ['memberships.status', 'trialling'] },
        { lte: ['memberships.joined_on', { $context: 'cutoff' }] },
      ],
    },
    sort: [{ field: 'memberships.joined_on', dir: 'asc' }],
  },
};


// ── WHO JUST JOINED ──────────────────────────────────────────
//
// A welcome is the most obviously useful automation a studio has and there was
// no way to say it: the vocabulary held "trials past their window" and
// "everybody booked tomorrow", and neither is "somebody new".
export const joinedRecently: CacheEntry = {
  fingerprint: 'automation/joined-recently',
  intent: 'Memberships at this studio that started on or after a given date',
  shape: [{ membership_id: '', person_name: '', person_id: '', joined_on: '' }],
  dsl: {
    from: ['memberships', 'people'],
    fields: [
      { field: 'memberships.id', as: 'membership_id' },
      'memberships.joined_on',
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
    ],
    filter: { and: [{ neq: ['memberships.status', 'cancelled'] }, { gte: ['memberships.joined_on', { $context: 'cutoff' }] }] },
    sort: [{ field: 'memberships.joined_on', dir: 'desc' }],
  },
};

// ── WHO CAME YESTERDAY ───────────────────────────────────────
//
// The follow-up after a class — "how did you find it", "here is what's next".
// Reads check-ins rather than bookings on purpose: it acts on people who
// actually TURNED UP, which is a different set from the one that booked.
export const attendedOnDay: CacheEntry = {
  fingerprint: 'automation/attended-on-day',
  intent: 'Everybody who checked in to a class on a given day',
  shape: [{ check_in_id: '', person_id: '', person_name: '', class_name: '', starts_at: '' }],
  dsl: {
    from: ['check_ins', 'class_sessions', 'memberships', 'people'],
    fields: [
      { field: 'check_ins.id', as: 'check_in_id' },
      { field: 'class_sessions.name', as: 'class_name' },
      'class_sessions.starts_at',
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
    ],
    filter: { eq: ['class_sessions.held_on', { $context: 'day' }] },
    sort: [{ field: 'class_sessions.starts_at', dir: 'asc' }],
  },
};

// ── WHO IS WAITING FOR A SEAT ────────────────────────────────
//
// Waitlisting already works and is already silent: a seat frees, the trigger
// promotes the longest waiter, and nobody tells them. This is the audience that
// closes that loop.
export const waitingForASeat: CacheEntry = {
  fingerprint: 'automation/waitlisted',
  intent: 'Everybody sitting on a waitlist for a future class at this studio',
  shape: [{ booking_id: '', person_id: '', person_name: '', class_name: '', starts_at: '' }],
  dsl: {
    from: ['bookings', 'class_sessions', 'memberships', 'people'],
    fields: [
      { field: 'bookings.id', as: 'booking_id' },
      { field: 'class_sessions.name', as: 'class_name' },
      'class_sessions.starts_at',
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
    ],
    filter: { and: [{ eq: ['bookings.status', 'waitlisted'] }, { gte: ['class_sessions.held_on', { $context: 'day' }] }] },
    sort: [{ field: 'class_sessions.held_on', dir: 'asc' }],
  },
};


// ── WHO IS COMING TODAY ──────────────────────────────────────
export const bookingsToday: CacheEntry = {
  fingerprint: 'automation/bookings-today',
  intent: 'Booked classes at this studio on the current day, with who is coming',
  shape: [{ booking_id: '', person_id: '', person_name: '', class_name: '', starts_at: '' }],
  dsl: {
    from: ['bookings', 'class_sessions', 'memberships', 'people'],
    fields: [
      { field: 'bookings.id', as: 'booking_id' },
      { field: 'class_sessions.name', as: 'class_name' },
      'class_sessions.starts_at',
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
    ],
    filter: { and: [{ eq: ['bookings.status', 'booked'] }, { eq: ['class_sessions.held_on', { $context: 'day' }] }] },
    sort: [{ field: 'class_sessions.starts_at', dir: 'asc' }],
  },
};

// ── WHOSE PLAN IS ABOUT TO END ───────────────────────────────
//
// The renewal conversation, which a studio currently has by remembering. A
// subscription with an end date inside the window is somebody about to stop
// paying unless somebody talks to them.
export const subscriptionsEnding: CacheEntry = {
  fingerprint: 'automation/subscriptions-ending',
  intent: 'Active subscriptions at this studio ending on or before a given date',
  shape: [{ subscription_id: '', person_id: '', person_name: '', plan_name: '', ends_on: '' }],
  dsl: {
    from: ['subscriptions', 'memberships', 'people', 'plans'],
    fields: [
      { field: 'subscriptions.id', as: 'subscription_id' },
      'subscriptions.ends_on',
      { field: 'plans.name', as: 'plan_name' },
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
    ],
    filter: { and: [{ eq: ['subscriptions.status', 'active'] }, { lte: ['subscriptions.ends_on', { $context: 'cutoff' }] }] },
    sort: [{ field: 'subscriptions.ends_on', dir: 'asc' }],
  },
};

// ── WHO LEFT ─────────────────────────────────────────────────
//
// The win-back. A cancelled membership is the one row in this application that
// nothing ever looks at again.
export const membershipsEnded: CacheEntry = {
  fingerprint: 'automation/memberships-ended',
  intent: 'Memberships at this studio that ended on or after a given date',
  shape: [{ membership_id: '', person_id: '', person_name: '', ended_on: '' }],
  dsl: {
    from: ['memberships', 'people'],
    fields: [
      { field: 'memberships.id', as: 'membership_id' },
      'memberships.ended_on',
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
    ],
    filter: { and: [{ eq: ['memberships.status', 'cancelled'] }, { gte: ['memberships.ended_on', { $context: 'cutoff' }] }] },
    sort: [{ field: 'memberships.ended_on', dir: 'desc' }],
  },
};

// ── WHO IS ON A BLOCK THAT IS ABOUT TO START ─────────────────
export const enrolmentsStarting: CacheEntry = {
  fingerprint: 'automation/enrolments-starting',
  intent: 'People enrolled on courses at this studio starting on or before a given date',
  shape: [{ enrolment_id: '', person_id: '', person_name: '', class_name: '', starts_at: '' }],
  dsl: {
    from: ['enrolments', 'courses', 'people'],
    fields: [
      { field: 'enrolments.id', as: 'enrolment_id' },
      { field: 'courses.name', as: 'class_name' },
      { field: 'courses.starts_on', as: 'starts_at' },
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
    ],
    filter: { and: [{ eq: ['enrolments.status', 'enrolled'] }, { lte: ['courses.starts_on', { $context: 'cutoff' }] }, { gte: ['courses.ends_on', { $context: 'day' }] }] },
    sort: [{ field: 'courses.starts_on', dir: 'asc' }],
  },
};

// ── WHO IS PAUSED ────────────────────────────────────────────
//
// A paused membership is a decision somebody made once and nobody revisits.
export const membershipsPaused: CacheEntry = {
  fingerprint: 'automation/memberships-paused',
  intent: 'Paused memberships at this studio',
  shape: [{ membership_id: '', person_id: '', person_name: '', joined_on: '' }],
  dsl: {
    from: ['memberships', 'people'],
    fields: [
      { field: 'memberships.id', as: 'membership_id' },
      'memberships.joined_on',
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
    ],
    filter: { eq: ['memberships.status', 'paused'] },
    sort: [{ field: 'memberships.joined_on', dir: 'asc' }],
  },
};

// ACTIVE MEMBERS WHO HAVE STOPPED COMING.
//
// The one audience a studio actually loses money to, and the last one built —
// because it is the only one that is a NEGATIVE: everybody active with NO
// attendance since a cutoff. Every other audience selects rows that exist.
//
// `not` + `exists` is a correlated subquery: the inner filter compares
// `bookings.membership_id` against `memberships.id` from the outer row, so it
// asks "did THIS member attend anything since the cutoff" once per member.
// Counting attendances and filtering on zero would not work — a member with no
// rows at all produces no row to count.
export const membersLapsedAway: CacheEntry = {
  fingerprint: 'automation/not-seen-since',
  intent: 'Active members with no attended class since a cutoff',
  shape: [{ membership_id: '', person_id: '', person_name: '', joined_on: '' }],
  dsl: {
    from: ['memberships', 'people'],
    fields: [
      { field: 'memberships.id', as: 'membership_id' },
      'memberships.joined_on',
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
    ],
    filter: {
      and: [
        { eq: ['memberships.status', 'active'] },
        {
          not: {
            exists: {
              from: ['bookings', 'class_sessions'],
              filter: {
                and: [
                  // The correlation: this member's bookings, not everybody's.
                  { eq: ['bookings.membership_id', 'memberships.id'] },
                  { eq: ['bookings.attended', true] },
                  { gte: ['class_sessions.held_on', { $context: 'cutoff' }] },
                ],
              },
            },
          },
        },
      ],
    },
    sort: [{ field: 'memberships.joined_on', dir: 'asc' }],
  },
};

// Who is booked into a class on a given day.
//
// Reads the OPERATIONAL `bookings`, not the member's mirror — and the reason
// is a good demonstration of the boundary working as intended rather than as a
// nuisance.
//
// `member_bookings` carries the class name already, so it looked like the
// easier source. But its behaviors pin every read to `person_id = userId`, and
// the automation's `userId` is the automation. It would have selected zero rows
// forever: no error, no refusal, just a reminder job that quietly never
// reminded anybody. The personal rule does not know that this caller means
// well, which is exactly the property that makes it worth having.
//
// So the automation reads the studio's own bookings, which is what it is
// entitled to, and pays for it with three joins. All three foreign keys are
// NOT NULL, so vex INNER-joins them — correct here, because a booking with no
// session or no member is not a row anybody wants reminding about.
export const bookingsOnDay: CacheEntry = {
  fingerprint: 'automation/bookings-on-day',
  intent: 'Booked classes at this studio on a given day, with who is coming',
  shape: [{ booking_id: '', person_id: '', person_name: '', class_name: '', starts_at: '' }],
  dsl: {
    from: ['bookings', 'class_sessions', 'memberships', 'people'],
    fields: [
      { field: 'bookings.id', as: 'booking_id' },
      { field: 'people.id', as: 'person_id' },
      { field: 'people.name', as: 'person_name' },
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

// What the automations have said, newest first. For the operator's screen —
// the ledger tide keeps is about firings; this is about outcomes a human reads.
export const notificationsRecent: CacheEntry = {
  fingerprint: 'automation/notifications',
  intent: 'Messages this studio’s automations have produced',
  shape: [{ notification_id: '', kind: '', subject: '', body: '', created_on: '' }],
  dsl: {
    from: ['notifications'],
    fields: [
      { field: 'notifications.id', as: 'notification_id' },
      'notifications.kind',
      'notifications.subject',
      'notifications.body',
      'notifications.created_on',
    ],
    sort: [{ field: 'notifications.created_at', dir: 'desc' }],
    limit: 50,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        notification_id: row('notification_id'),
        kind: row('kind'),
        subject: row('subject'),
        body: row('body'),
        created_on: row('created_on'),
      },
    },
  },
};

// ─── what they do ────────────────────────────────────────────

// Lapsing a trial. The same `members/update` a desk uses would have done, and
// using it would have been the better story — except it also sets `notes`, and
// an automation that rewrites what the desk wrote about somebody is an
// automation that destroys evidence. So it gets a statement that touches one
// column, which is the narrowest thing that does the job.
export const lapseTrial: MutationEntry = {
  fingerprint: 'automation/lapse-trial',
  intent: 'Mark a trial membership lapsed, leaving everything else alone',
  mutation: {
    op: 'update',
    table: 'memberships',
    set: { status: 'lapsed' },
    where: {
      and: [
        { eq: ['memberships.id', { $context: 'membershipId' }] },
        // Re-checking the state IN the statement, not just in the selection.
        //
        // A task can be claimed minutes after it was selected, and a desk may
        // have reactivated somebody in between. Without this, a retry of an old
        // task would lapse a member who is now paying. The write is its own
        // guard, which is what makes replaying it safe.
        { eq: ['memberships.status', 'trialling'] },
      ],
    },
  },
};

// Leaving a message. `studio_id` is stamped by the engine, so a reflex cannot
// write into another studio's inbox even if its input said so.
export const notify: MutationEntry = {
  fingerprint: 'automation/notify',
  intent: 'Record a message from an automation',
  mutation: {
    op: 'insert',
    table: 'notifications',
    values: {
      person_id: { $context: 'personId' },
      kind: { $context: 'kind' },
      subject: { $context: 'subject' },
      body: { $context: 'body' },
    },
  },
};

// ─── the automations as rows ─────────────────────────────────
//
// A studio authors a TEMPLATE plus knobs, never a reflex. Which fingerprint is
// selected and which mutation is the effect stay authored in code, so a row
// cannot name a statement this application does not already ship.
export const automationsList: CacheEntry = {
  fingerprint: 'automations/list',
  intent: 'The automations this studio has set up',
  shape: [{ automation_id: '', audience: '', effect: '', enabled: false, run_at: '', trial_days: 0, subject: '', body: '', state_label: '', state_tone: '' }],
  dsl: {
    from: ['automations'],
    fields: [
      { field: 'automations.id', as: 'automation_id' },
      'automations.audience',
      'automations.effect',
      'automations.subject',
      'automations.body',
      'automations.enabled',
      'automations.run_at',
      'automations.trial_days',
    ],
    sort: [{ field: 'automations.run_at', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        automation_id: row('automation_id'),
        audience: row('audience'),
        effect: row('effect'),
        subject: row('subject'),
        body: row('body'),
        enabled: row('enabled'),
        run_at: row('run_at'),
        trial_days: row('trial_days'),
        state_label: { $case: { branches: [{ when: row('enabled'), then: 'On' }], else: 'Paused' } },
        state_tone: { $case: { branches: [{ when: row('enabled'), then: 'good' }], else: 'neutral' } },
      },
    },
  },
};

export const automationCreate: MutationEntry = {
  fingerprint: 'automations/create',
  intent: 'Set up an automation',
  mutation: {
    op: 'insert',
    table: 'automations',
    // WHO and WHAT are both written, and both are checked against the shipped
    // registries at load — so a row can combine what the app ships and cannot
    // name anything it does not.
    values: {
      audience: { $context: 'audience' },
      effect: { $context: 'effect' },
      run_at: { $context: 'runAt' },
      trial_days: { $context: 'trialDays' },
      subject: { $context: 'subject' },
      body: { $context: 'body' },
    },
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
      trial_days: { $context: 'trialDays' },
      subject: { $context: 'subject' },
      body: { $context: 'body' },
      enabled: { $context: 'enabled' },
    },
    where: { eq: ['automations.id', { $context: 'automationId' }] },
  },
};
