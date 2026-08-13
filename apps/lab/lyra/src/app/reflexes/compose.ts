import type { ReflexInput } from '@niscorp/tide';
import { bookingsOnDay, enquiredPerson, joinedSubscription, membersLapsedAway, queueMessage, trialsDue } from '@lyra/app/vex/tide.entries';

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
    blurb: 'Queued in the outbox. Nothing is delivered yet — Lyra has no mail integration, and the screen says so rather than pretending.',
    words: { subject: 'Subject', body: 'Message', hint: 'What they would receive. Your words, in your studio’s name.' },
    fingerprint: queueMessage.fingerprint,
    input: (row, moment) => ({
      personId: { $ref: '$.row.person_id' },
      toAddress: { $ref: '$.row.email' },
      subject: row.subject,
      body: withFacts(row.body, moment),
      source: row.id,
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
