import type { ReflexInput } from '@niscorp/tide';
import { bookingsOnDay, enquiredPerson, joinedSubscription, membersLapsedAway, outboxStuck, queueMessage, trialsDue } from '@lyra/app/vex/tide.entries';

export type AutomationRow = {
  id: string;
  moment: string;
  effect: string;
  enabled: boolean;
  run_at: string;
  days: number;
  subject: string;
  body: string;
};

// ── WHEN ─────────────────────────────────────────────────────

export type Moment = {
  id: string;
  /** The "when" half of the sentence, lower case: "somebody joins". */
  label: string;
  blurb: string;
  /** Written (a write fact off the vex bridge wakes it) rather than clocked. */
  watched: boolean;
  /** Watched only: which write wakes this moment, and how the enrichment
   *  selection anchors to the fact's own row. The anchor is a prism template
   *  evaluated at fan-out with `$.fact` in scope, so the selection re-reads
   *  exactly the row the write committed — under the automation's own
   *  principal, which is what re-checks reality before anything sends. */
  watch?: { entity: string; op: 'insert' | 'update' | 'delete'; anchor: Record<string, unknown> };
  /** Whether the number means anything here, and what it means when it does.
   *  The form asks for exactly the knobs a moment uses rather than showing
   *  every knob any automation has ever needed. */
  daysLabel?: string;
  unitKey: string;
  fingerprint: string;
  context: (row: AutomationRow) => Record<string, unknown>;
  /** Does the row carry a class name and time? Decides whether a message may
   *  mention one — a body ending "(Vinyasa at 18:30)" is wrong on a moment that
   *  has no class. */
  hasClass?: boolean;
  /** IS THIS WINNING SOMEBODY BACK, rather than serving somebody who asked?
   *
   *  Declared on the MOMENT and not per automation, so the consent filter
   *  cannot be forgotten by whoever writes the next one: the selection behind a
   *  marketing moment carries the opt-in test, and the row it queues carries
   *  the flag that puts an unsubscribe footer on the wire. A reminder about a
   *  class somebody booked is contractual and needs neither. */
  marketing?: boolean;
};

const dayOffset = (amount: number): Record<string, unknown> => ({
  $date: { value: { $dateAdd: { date: { $ref: '$.now' }, amount, unit: 'day' } }, format: 'YYYY-MM-DD' },
});

const FAR_FUTURE = '9999-12-31';

export const MOMENTS: readonly Moment[] = [
  // FIVE, DOWN FROM THIRTEEN, and the cut was made with evidence rather than
  // taste: every moment below was driven through the engine against the seeded
  // database and watched to select real people. Three of the thirteen were
  // REFUSED every time they ran —
  //
  //   plan.ending     reads `plans`      · not on the automation rung
  //   course.starting reads `enrolments` · not on the automation rung
  //   member.trained  reads `check_ins`  · not on the automation rung
  //
  // — and one of them, `plan.ending`, was offered in the builder as a recipe a
  // studio could click. They can come back the day somebody adds the grant and
  // proves it; a moment nobody has seen work is a promise, not a feature.
  //
  // The rest went for reasons of their own, recorded so nobody re-adds them
  // by reflex: `trial.ended` is `trial.ending` after it is too late to matter;
  // `class.today` is `class.tomorrow` with less notice; `member.left` emails
  // somebody who has already gone; `member.paused` works but earns less than
  // it costs to explain; and `waitlist.waiting` was the WRONG SHAPE — a seat
  // opening is an event, and a daily clock that tells somebody at 09:00 they
  // have a place in a 10:00 class is not the automation that idea deserves.
  // It belongs back here as a watched moment, and that is a real piece of work.

  // ── watched: the two minutes worth reacting to inside one ──
  {
    id: 'member.joined',
    label: 'somebody joins',
    blurb: 'The moment a subscription starts — the highest-value minute a studio has, and the one nothing used to notice.',
    watched: true,
    watch: { entity: 'subscriptions', op: 'insert', anchor: { subscriptionId: { $ref: '$.fact.row.id' } } },
    unitKey: 'subscription_id',
    fingerprint: joinedSubscription.fingerprint,
    context: () => ({}),
  },
  {
    id: 'enquiry.recorded',
    label: 'somebody enquires',
    blurb: 'The moment somebody new is written down. Replying within minutes is the difference between a member and a lost one.',
    watched: true,
    watch: { entity: 'studio_people', op: 'insert', anchor: { studioPersonId: { $ref: '$.fact.row.id' } } },
    unitKey: 'studio_person_id',
    fingerprint: enquiredPerson.fingerprint,
    context: () => ({}),
  },

  // ── scheduled: the three that are genuinely a time of day ──
  {
    id: 'trial.ending',
    label: 'a trial is about to run out',
    blurb: 'People whose free window closes within the next few days — while there is still time to ask them.',
    watched: false,
    daysLabel: 'Days of notice',
    unitKey: 'studio_person_id',
    fingerprint: trialsDue.fingerprint,
    context: (row) => ({ from: dayOffset(0), cutoff: dayOffset(row.days) }),
  },
  {
    id: 'member.quiet',
    label: 'somebody stops coming',
    blurb: 'Still paying, no class attended inside the window. The people a studio loses without noticing.',
    watched: false,
    daysLabel: 'Days without a visit',
    unitKey: 'subscription_id',
    fingerprint: membersLapsedAway.fingerprint,
    context: (row) => ({ cutoff: dayOffset(-row.days) }),
    // "We have missed you" is marketing in AT/DE however warmly it is worded:
    // it is sent to win somebody back, not because they asked for it. Consent
    // and a one-click opt-out are the price, and the selection behind this
    // moment enforces the first.
    marketing: true,
  },
  {
    id: 'class.tomorrow',
    label: "it is the day before somebody's class",
    blurb: 'One message per person per class, so forty reminders retry independently.',
    watched: false,
    unitKey: 'booking_id',
    fingerprint: bookingsOnDay.fingerprint,
    context: () => ({ day: dayOffset(1) }),
    hasClass: true,
  },
];

// ── WHAT ─────────────────────────────────────────────────────

type Effect = {
  id: string;
  /** The "then" half, imperative: "add it to the desk's list". */
  label: string;
  blurb: string;
  /** Does the studio write words for this one, and what are they called. */
  words?: { subject: string; body?: string; hint: string };
  fingerprint: string;
  input: (row: AutomationRow, moment: Moment) => Record<string, unknown>;
};

const withFacts = (text: string, moment: Moment): Record<string, unknown> | string => {
  if (moment.hasClass !== true) return text;
  return { $join: { parts: [text, ' (', { $ref: '$.row.class_name' }, ' at ', { $ref: '$.row.starts_at' }, ')'], sep: '' } };
};

export const EFFECTS: readonly Effect[] = [
  {
    id: 'email',
    label: 'email them',
    // SAYS ONLY WHAT IS TRUE FOR EVERY STUDIO. It said replies come back to
    // your own address, which is what the design intends and what the seeded
    // studios do — and a studio whose reply address is still blank would have
    // been reading a promise. The place to say that sentence is the settings
    // screen, next to the field that makes it true.
    blurb: 'Sent in your studio’s name. Every message is kept in the outbox, so you can see what went and what did not.',
    words: { subject: 'Subject', body: 'Message', hint: 'What they would receive. Your words, in your studio’s name.' },
    fingerprint: queueMessage.fingerprint,
    input: (row, moment) => ({
      personId: { $ref: '$.row.person_id' },
      toAddress: { $ref: '$.row.email' },
      subject: row.subject,
      body: withFacts(row.body, moment),
      source: row.id,
      // Travels with the message rather than being re-derived at the wire: by
      // the time the dispatcher wakes, all it has is the row.
      marketing: moment.marketing === true,
    }),
  },
];

// THE SELECTION, COMPOSED IN ONE PLACE.
//
// The reflex asks this question when it fires, and the form's rehearsal asks
// the same one while somebody is still typing. Two copies of it would drift,
// and the drift would be invisible: the rehearsal would say "3 people" about a
// query the automation does not run.
export const selectionFor = (moment: Moment, row: AutomationRow): { fingerprint: string; context: Record<string, unknown> } => ({
  fingerprint: moment.fingerprint,
  // A watched moment's anchor refs (`$.fact.row.…`) resolve at fan-out, when
  // the fact is in scope — a rehearsal has no fact and must not ask this
  // question; the form's audience says "as it happens" instead.
  context: { ...moment.context(row), ...(moment.watch?.anchor ?? {}), horizon: FAR_FUTURE },
});

export const momentById = (id: string): Moment | undefined => MOMENTS.find((m) => m.id === id);
export const effectById = (id: string): Effect | undefined => EFFECTS.find((e) => e.id === id);

/** Every pairing is meaningful today. Kept as a function because the screens
 *  ask, and because the day an effect needs something narrower this is where to
 *  say so. */
export const pairs = (momentId: string, effectId: string): boolean =>
  momentById(momentId) !== undefined && effectById(effectId) !== undefined;

/** THE SENTENCE, moment first. It read effect-first — "Leave them a message —
 *  booked tomorrow" — which is backwards in every language. */
export const nameOf = (row: { moment: string; effect: string }): string => {
  const m = momentById(row.moment);
  const e = effectById(row.effect);
  if (m === undefined || e === undefined) return `${row.moment} → ${row.effect}`;
  return `When ${m.label}, ${e.label}`;
};

export const reflexIdFor = (studioId: string, row: { id: string }): string => `${studioId}:${row.id}`;

// ── THE ONE REFLEX NOBODY SET UP ─────────────────────────────
//
// HOW MANY TIMES A MESSAGE IS TRIED, stated once because two places need the
// same number: the policy below, and the effect, which has to know when it is
// on its LAST attempt so it can stop putting the row back in a queue nothing
// will ever read again. Tide counts attempts from 1, so the last one is
// `MAIL_RETRIES + 1`.
export const MAIL_RETRIES = 2;
export const MAIL_ATTEMPTS = MAIL_RETRIES + 1;

//
// Every reflex above is a row a studio wrote. This one is the product being
// able to send at all: a queued message wakes it, it re-reads that row under
// the studio's own principal, and the effect hands it to the transport.
//
// WHY A REFLEX AND NOT A LOOP, which is the whole reason the bridge exists:
// one task per message, so forty reminders retry independently rather than as
// one batch that half-fails; the retry policy is already written; the ledger
// already records what ran. A drain loop would have to invent all three, and
// would still send the fortieth message late.
//
// It is A CYCLE in the flow graph — it watches `outbox` and its effect writes
// `outbox` — and that is honest rather than accidental: the graph is keyed by
// entity and cannot see that the watch is on `insert` and the write is an
// update. It is a GUARDED cycle (it has a selection, which re-reads state and
// answers with nothing for a message already taken), and a guarded cycle is
// the shape tide was built to allow. See tide-check, which asserts the
// distinction rather than the count.
/** How long a message may sit before the sweep counts it as abandoned. Long
 *  enough that it never races the dispatcher, short enough that a retry
 *  somebody pressed is picked up the same day. */
export const STUCK_AFTER_MS = 15 * 60_000;

// ── THE SAFETY NET ───────────────────────────────────────────
//
// The dispatcher above wakes on a WRITE, which is the right trigger and has
// one hole in it: the fact is delivered once. A process that dies mid-send, or
// a row put back by hand, has nothing left to wake anything — the message
// simply sits there, and the screen says "Not sent" forever with nobody
// working on it.
//
// So a clock, once a day, asking the only question that matters: what did this
// studio queue that never went? It runs the SAME effect, so a swept message
// takes the identical path — claim, send, record — and the claim is what stops
// it colliding with a dispatcher that was merely slow.
//
// Daily is what tide's calendar clock offers and it is proportionate: this is
// a net, not a queue. When somebody presses Retry the screen fires this reflex
// directly rather than waiting for tomorrow.
export const sweepReflex = (studioId: string, timezone: string): ReflexInput => ({
  id: `${studioId}:outbox-sweep`,
  intent: 'Send what never went out.',
  as: `automation@${studioId}`,
  on: { clock: { every: 'day', at: '04:00', tz: timezone } },
  select: {
    query: { fingerprint: outboxStuck.fingerprint, context: { stuckBefore: { $dateAdd: { date: { $ref: '$.now' }, amount: -15, unit: 'minute' } } } },
    mode: 'each',
    unitKey: 'message_id',
  },
  // The same input the dispatcher builds, because it is the same effect and
  // the same envelope — see `outboxStuck`, which shares its shape.
  effect: {
    name: 'mail.send',
    input: {
      messageId: { $ref: '$.row.message_id' },
      to: { $ref: '$.row.to_address' },
      subject: { $ref: '$.row.subject' },
      body: { $ref: '$.row.body' },
      fromName: { $ref: '$.row.from_name' },
      fromBox: { $ref: '$.row.from_box' },
      replyTo: { $ref: '$.row.reply_to' },
      marketing: { $ref: '$.row.marketing' },
      personId: { $ref: '$.row.person_id' },
      studioId: { $ref: '$.row.studio_id' },
      suppressed: { $ref: '$.row.suppressed' },
      sendingDomain: { $ref: '$.row.sending_domain' },
      sendingDomainOk: { $ref: '$.row.sending_domain_ok' },
      dailyCap: { $ref: '$.row.daily_cap' },
    },
  },
  // A night missed is not a reason to skip: the whole point is that these rows
  // have been waiting.
  policy: { retry: { max: MAIL_RETRIES, backoff: 'fixed', baseMs: 30_000 }, timeoutMs: 15_000, overlap: 'skip' },
  enabled: true,
});

export const dispatchReflex = (studioId: string): ReflexInput => ({
  id: `${studioId}:outbox-dispatch`,
  intent: 'Send what the automations queued.',
  as: `automation@${studioId}`,
  on: { fact: { entity: 'outbox', op: 'insert' } },
  select: {
    query: {
      fingerprint: 'automation/outbox-queued',
      // Resolved at fan-out, with the fact in scope: the selection re-reads
      // exactly the row that committed, and nothing else.
      context: { messageId: { $ref: '$.fact.row.id' } },
    },
    mode: 'each',
    unitKey: 'message_id',
  },
  effect: {
    name: 'mail.send',
    input: {
      messageId: { $ref: '$.row.message_id' },
      to: { $ref: '$.row.to_address' },
      subject: { $ref: '$.row.subject' },
      body: { $ref: '$.row.body' },
      fromName: { $ref: '$.row.from_name' },
      fromBox: { $ref: '$.row.from_box' },
      replyTo: { $ref: '$.row.reply_to' },
      // Consent's half of the message: whether it earns a footer, and who the
      // opt-out link is minted for.
      marketing: { $ref: '$.row.marketing' },
      personId: { $ref: '$.row.person_id' },
      studioId: { $ref: '$.row.studio_id' },
      suppressed: { $ref: '$.row.suppressed' },
      sendingDomain: { $ref: '$.row.sending_domain' },
      sendingDomainOk: { $ref: '$.row.sending_domain_ok' },
      dailyCap: { $ref: '$.row.daily_cap' },
    },
  },
  // The same policy the automations carry, for the same reasons — and no
  // `catchUp`, which is a clock's word: a write fact either matched or waits.
  policy: { retry: { max: MAIL_RETRIES, backoff: 'fixed', baseMs: 30_000 }, timeoutMs: 15_000, overlap: 'skip' },
  enabled: true,
});

// ── THE COMPOSITION ──────────────────────────────────────────
export const reflexesFor = (studioId: string, timezone: string, rows: readonly AutomationRow[] = []): ReflexInput[] => {
  const as = `automation@${studioId}`;
  const reflexes: ReflexInput[] = [];

  for (const row of rows) {
    const moment = momentById(row.moment);
    const effect = effectById(row.effect);
    if (moment === undefined || effect === undefined) continue;

    reflexes.push({
      id: reflexIdFor(studioId, row),
      intent: `${nameOf(row)}.`,
      as,
      // A watched moment wakes ON THE WRITE — the vex bridge mints the fact
      // the instant the row commits, stamped with this studio's automation
      // identity, so nobody waits for a beat and nobody hears about another
      // studio's members. A clocked moment is genuinely a time of day.
      on: moment.watch !== undefined ? { fact: { entity: moment.watch.entity, op: moment.watch.op } } : { clock: { every: 'day', at: row.run_at, tz: timezone } },
      params: { days: row.days },
      select: {
        query: selectionFor(moment, row),
        // `each` keys the task on the unit, so a retry is a no-op rather than a
        // second write.
        mode: 'each',
        unitKey: moment.unitKey,
      },
      effect: { name: effect.fingerprint, input: effect.input(row, moment) },
      // `catchUp: 'skip'` is the clock's knob: a night missed while the
      // process was down should not produce yesterday's reminders at noon.
      // A write fact needs no such rule — it either matched or it waits.
      policy: { retry: { max: 2, backoff: 'fixed', baseMs: 30_000 }, timeoutMs: 15_000, overlap: 'skip', ...(moment.watch === undefined ? { catchUp: 'skip' as const } : {}) },
      enabled: row.enabled,
    });
  }

  return reflexes;
};
