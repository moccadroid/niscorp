import type { ReflexInput } from '@niscorp/tide';
import {
  attendedOnDay,
  bookingsOnDay,
  bookingsToday,
  enrolmentsStarting,
  joinedRecently,
  lapseTrial,
  membershipsEnded,
  membershipsPaused,
  membersLapsedAway,
  notify,
  subscriptionsEnding,
  trialsDue,
  waitingForASeat,
} from '@lyra/app/vex/tide.entries';

// AN AUTOMATION IS A WHO, A WHAT AND A WHEN.
//
// What this replaces: three shipped SHAPES in a picklist. A studio could change
// the time one ran and nothing else — every interesting decision had already
// been made, by me, at build time. Three cron jobs with a toggle.
//
// The reason it was a picklist is real and survives intact: a reflex selects
// rows and applies an effect, and a studio that could author either would route
// around the charter completely. "A row cannot name a statement the app does not
// ship" is load-bearing and is NOT relaxed here.
//
// But that rule never implied a picklist — it implies closed VOCABULARIES. The
// old shapes already consisted of a `select` (who) and an `effect` (what),
// frozen together in pairs. Below they are two registries, and a row picks one
// from each. Both halves still ship with the application; the studio composes
// them.
//
// The tell that the old factoring was wrong: the first genuinely useful new
// automation — warn people BEFORE their trial lapses — needs no new fingerprint
// at all. It is `trials.ending` × `message`, two things that already existed and
// could not be said together.

export type AutomationRow = {
  id: string;
  audience: string;
  effect: string;
  enabled: boolean;
  run_at: string;
  trial_days: number;
  subject: string;
  body: string;
};

// ── WHO ──────────────────────────────────────────────────────
//
// An audience is a shipped read plus the unit it fans out on. `usesTrialDays`
// is what lets the form ask for a window only when the audience has one, rather
// than showing every knob any automation has ever needed.
type Audience = {
  id: string;
  label: string;
  blurb: string;
  usesTrialDays: boolean;
  unitKey: string;
  fingerprint: string;
  context: (row: AutomationRow) => Record<string, unknown>;
};

// The cutoff is computed from the tick's LOGICAL now, never a wall-clock read —
// which is what lets a check march time forward and get the answers the real
// thing would.
//
// Wrapped in `$date`, and the reason is worth keeping: `$dateAdd` on an epoch
// returns a full ISO timestamp, and comparing that to a DATE column matches
// nothing — silently, with no error anywhere. A reflex selecting zero rows
// forever looks exactly like a studio that has no trials.
const dayOffset = (amount: number): Record<string, unknown> => ({
  $date: { value: { $dateAdd: { date: { $ref: '$.now' }, amount, unit: 'day' } }, format: 'YYYY-MM-DD' },
});

export const AUDIENCES: readonly Audience[] = [
  {
    id: 'trials.ending',
    label: 'trials past their window',
    blurb: 'Everybody whose trial started longer ago than the studio’s trial window.',
    usesTrialDays: true,
    unitKey: 'membership_id',
    fingerprint: trialsDue.fingerprint,
    context: (row) => ({ cutoff: dayOffset(-row.trial_days) }),
  },
  {
    id: 'classes.tomorrow',
    label: 'booked tomorrow',
    blurb: 'One unit per person per class, so forty reminders retry independently.',
    usesTrialDays: false,
    unitKey: 'booking_id',
    fingerprint: bookingsOnDay.fingerprint,
    context: () => ({ day: dayOffset(1) }),
  },
  {
    // The most obviously useful automation a studio has, and there was no way
    // to say it: the vocabulary held "trials past their window" and "booked
    // tomorrow", and neither of those is "somebody new".
    id: 'members.new',
    label: 'just joined',
    blurb: 'Anybody whose membership started within the window.',
    usesTrialDays: true,
    unitKey: 'membership_id',
    fingerprint: joinedRecently.fingerprint,
    context: (row) => ({ cutoff: dayOffset(-row.trial_days) }),
  },
  {
    // People who actually TURNED UP, which is a different set from the one that
    // booked — so this reads check-ins rather than bookings.
    id: 'classes.attended',
    label: 'came yesterday',
    blurb: 'The people who checked in, not the ones who booked.',
    usesTrialDays: false,
    unitKey: 'check_in_id',
    fingerprint: attendedOnDay.fingerprint,
    context: () => ({ day: dayOffset(-1) }),
  },
  {
    // Waitlisting already works and is already silent: a seat frees, the
    // trigger promotes the longest waiter, and nobody tells them. This closes
    // that loop without a line of new mechanism.
    id: 'bookings.waitlisted',
    label: 'on a waitlist',
    blurb: 'Anybody on a waitlist for a class still to come.',
    usesTrialDays: false,
    unitKey: 'booking_id',
    fingerprint: waitingForASeat.fingerprint,
    context: () => ({ day: dayOffset(0) }),
  },
  {
    // Today, not tomorrow — a morning list for the desk, or a nudge to the
    // people who said they were coming.
    id: 'classes.today',
    label: 'booked in today',
    blurb: 'Everybody with a seat in a class happening today.',
    usesTrialDays: false,
    unitKey: 'booking_id',
    fingerprint: bookingsToday.fingerprint,
    context: () => ({ day: dayOffset(0) }),
  },
  {
    // The renewal conversation, which a studio currently has by remembering.
    id: 'plans.ending',
    label: 'whose plan is ending',
    blurb: 'Anybody on an active plan due to end inside the window.',
    usesTrialDays: true,
    unitKey: 'subscription_id',
    fingerprint: subscriptionsEnding.fingerprint,
    context: (row) => ({ cutoff: dayOffset(row.trial_days) }),
  },
  {
    // The win-back. A cancelled membership is the one row in this application
    // that nothing ever looks at again.
    id: 'members.left',
    label: 'who recently left',
    blurb: 'Memberships cancelled inside the window.',
    usesTrialDays: true,
    unitKey: 'membership_id',
    fingerprint: membershipsEnded.fingerprint,
    context: (row) => ({ cutoff: dayOffset(-row.trial_days) }),
  },
  {
    // A paused membership is a decision somebody made once and nobody revisits.
    id: 'members.paused',
    label: 'on a paused membership',
    blurb: 'Everybody who put their membership on hold and has not come back.',
    usesTrialDays: false,
    unitKey: 'membership_id',
    fingerprint: membershipsPaused.fingerprint,
    context: () => ({}),
  },
  {
    // THE ONE THAT COSTS MONEY. Somebody is still paying and has stopped
    // turning up; in a month or two they notice the direct debit rather than
    // the classes. Every other audience here selects people who did something —
    // this one selects people who did NOT, which is why it needed a correlated
    // NOT EXISTS and why it was the last one built.
    id: 'members.quiet',
    label: 'who have stopped coming',
    blurb: 'Still paying, no class attended inside the window. The people a studio loses without noticing.',
    usesTrialDays: true,
    unitKey: 'membership_id',
    fingerprint: membersLapsedAway.fingerprint,
    context: (row) => ({ cutoff: dayOffset(-row.trial_days) }),
  },
  {
    // The block is about to start and the people on it have forgotten.
    id: 'courses.starting',
    label: 'on a course about to start',
    blurb: 'People enrolled on a block starting inside the window.',
    usesTrialDays: true,
    unitKey: 'enrolment_id',
    fingerprint: enrolmentsStarting.fingerprint,
    context: (row) => ({ cutoff: dayOffset(row.trial_days), day: dayOffset(0) }),
  },
];

// ── WHAT ─────────────────────────────────────────────────────
//
// `appliesTo` is the honest part of a composition model: not every pairing makes
// sense. Marking a trial lapsed needs a membership, so it can only follow an
// audience that yields one. The form offers what fits and nothing else, which is
// better than letting somebody build a combination that silently selects zero
// rows forever.
type Effect = {
  id: string;
  label: string;
  blurb: string;
  usesMessage: boolean;
  appliesTo: readonly string[];
  fingerprint: string;
  input: (row: AutomationRow, audience: Audience) => Record<string, unknown>;
};

// The studio's own words, with the row's facts available. A message about
// somebody's membership is the studio talking to their member — hardcoding the
// sentence was the clearest case in this application of data living in code.
const withFacts = (text: string, audience: Audience): Record<string, unknown> | string => {
  if (!['classes.tomorrow', 'classes.attended', 'bookings.waitlisted', 'classes.today', 'courses.starting'].includes(audience.id)) return text;
  return { $join: { parts: [text, ' (', { $ref: '$.row.class_name' }, ' at ', { $ref: '$.row.starts_at' }, ')'], sep: '' } };
};

export const EFFECTS: readonly Effect[] = [
  {
    id: 'message',
    label: 'Leave them a message',
    blurb: 'A note in their account. The studio writes the words.',
    usesMessage: true,
    appliesTo: ['trials.ending', 'classes.tomorrow', 'members.new', 'classes.attended', 'bookings.waitlisted', 'classes.today', 'plans.ending', 'members.left', 'members.paused', 'courses.starting'],
    fingerprint: notify.fingerprint,
    input: (row, audience) => ({
      personId: { $ref: '$.row.person_id' },
      kind: 'studio-message',
      subject: row.subject,
      body: withFacts(row.body, audience),
    }),
  },
  {
    // The one effect here that changes somebody's standing with the studio, and
    // therefore the one worth being most careful about. The WRITE re-checks
    // `status = 'trialling'` in its own WHERE, so a desk reactivating somebody
    // between selection and execution wins — a guard that survives every
    // ordering, which is why it lives in the statement and not in this file.
    id: 'trial.lapse',
    label: 'Mark the trial lapsed',
    blurb: 'Ends the trial. This one changes a membership, so preview it first.',
    usesMessage: false,
    appliesTo: ['trials.ending'],
    fingerprint: lapseTrial.fingerprint,
    input: () => ({ membershipId: { $ref: '$.row.membership_id' } }),
  },
  {
    // TELL THE STUDIO, not the member. The same shipped write, addressed to
    // nobody — which is what turns a message into a briefing.
    //
    // It pairs with every audience, and that is the whole argument for a
    // vocabulary over a picklist: "who is coming today", "who is on a paused
    // membership", "whose plan ends this month" all become a morning briefing
    // without a line of new mechanism, and none of them was expressible an
    // hour ago.
    id: 'studio.notify',
    label: 'Tell the studio',
    blurb: 'A note for the studio itself, not for the member.',
    usesMessage: true,
    appliesTo: ['trials.ending', 'classes.tomorrow', 'members.new', 'classes.attended', 'bookings.waitlisted', 'classes.today', 'plans.ending', 'members.left', 'members.paused', 'courses.starting'],
    fingerprint: notify.fingerprint,
    input: (row, audience) => ({
      personId: null,
      kind: 'studio-briefing',
      subject: row.subject,
      body: withFacts(row.body, audience),
    }),
  },
];

export const audienceById = (id: string): Audience | undefined => AUDIENCES.find((a) => a.id === id);
export const effectById = (id: string): Effect | undefined => EFFECTS.find((e) => e.id === id);

/** Does this pairing exist? The registries answer, not a hand-kept list. */
export const pairs = (audienceId: string, effectId: string): boolean => effectById(effectId)?.appliesTo.includes(audienceId) === true;

/** The human name of a row, built from its two halves rather than stored. */
export const nameOf = (row: { audience: string; effect: string }): string => {
  const a = audienceById(row.audience);
  const e = effectById(row.effect);
  if (a === undefined || e === undefined) return `${row.audience} → ${row.effect}`;
  return `${e.label} — ${a.label}`;
};

export const reflexIdFor = (studioId: string, row: { id: string }): string => `${studioId}:${row.id}`;

// ── THE COMPOSITION ──────────────────────────────────────────
//
// One row in, one reflex out — but the shape is now assembled from two
// registries instead of looked up in one. A row naming an audience or an effect
// this version does not ship yields nothing, which is the same refusal the
// template registry gave and for the same reason.
export const reflexesFor = (studioId: string, timezone: string, rows: readonly AutomationRow[] = []): ReflexInput[] => {
  const as = `automation@${studioId}`;
  const reflexes: ReflexInput[] = [];

  for (const row of rows) {
    const audience = audienceById(row.audience);
    const effect = effectById(row.effect);
    if (audience === undefined || effect === undefined || !pairs(row.audience, row.effect)) continue;

    reflexes.push({
      id: reflexIdFor(studioId, row),
      // The intent is the reflex's own account of itself, and tide demands one.
      // Composed from the two halves so it stays true when either changes —
      // an automation nobody can read is one nobody can be responsible for.
      intent: `${effect.label} — ${audience.label}.`,
      as,
      on: { clock: { every: 'day', at: row.run_at, tz: timezone } },
      params: { trialDays: row.trial_days },
      select: {
        query: { fingerprint: audience.fingerprint, context: audience.context(row) },
        // `each` keys the task on the unit, so a retry is a no-op rather than a
        // second write.
        mode: 'each',
        unitKey: audience.unitKey,
      },
      effect: { name: effect.fingerprint, input: effect.input(row, audience) },
      policy:
        effect.id === 'trial.lapse'
          ? { retry: { max: 3, backoff: 'exponential', baseMs: 60_000 }, timeoutMs: 30_000, overlap: 'skip', catchUp: 'latest' }
          : { retry: { max: 2, backoff: 'fixed', baseMs: 30_000 }, timeoutMs: 15_000, overlap: 'skip', catchUp: 'skip' },
      enabled: row.enabled,
    });
  }

  // ── WHAT HAPPENED OVERNIGHT ────────────────────────────────
  //
  // FAN-IN, and it costs nothing: a settled firing mints a fact carrying its
  // stats, so "tell the studio what the night did" is an ordinary reflex
  // watching an ordinary fact. No callback, no shared state, no ordering
  // problem — the digest cannot run before the work because the fact it waits
  // on does not exist until the work settles.
  //
  // It is DERIVED rather than configured: it watches whichever row lapses
  // trials, so it follows the composition instead of naming a template id that
  // rows no longer have. Nothing to set up, and nothing to get wrong.
  const lapsing = rows.find((row) => row.effect === 'trial.lapse' && row.enabled);
  if (lapsing !== undefined) {
    reflexes.push({
      id: `${studioId}:digest`,
      intent: 'Tell the studio how many trials lapsed overnight.',
      as,
      on: { fact: { firing: reflexIdFor(studioId, lapsing) } },
      effect: {
        name: notify.fingerprint,
        input: {
          personId: null,
          kind: 'digest',
          subject: { $join: { parts: ['Trials lapsed overnight: ', { $ref: '$.fact.stats.done' }], sep: '' } },
          body: { $join: { parts: [{ $ref: '$.fact.stats.done' }, ' of ', { $ref: '$.fact.stats.total' }, ' processed, ', { $ref: '$.fact.stats.failed' }, ' failed.'], sep: '' } },
        },
      },
      // A digest for a night three days ago is noise.
      policy: { timeoutMs: 10_000, overlap: 'skip', catchUp: 'skip' },
      enabled: true,
    });
  }

  return reflexes;
};
