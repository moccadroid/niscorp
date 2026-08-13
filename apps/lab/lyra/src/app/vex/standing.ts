import type { ComputeExpression, Filter } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// STANDING IS DERIVED, ALWAYS.
//
// There is no stored "what this person is". A person just IS; what varies is
// the set of relationships they hold with a studio, and the one word a screen
// wears is computed at read time, on the studio's own day. The old model
// stored it (`memberships.status`), which forced every human into exactly one
// category and made "enquiries" a membership that wasn't one. Same rule as
// ever: if turning a job off makes the DATA wrong, it was a rule with a cron
// attached.
//
// The inputs are the RELATIONSHIP MIRRORS on `studio_people` (schema.ts):
// counts and horizon dates the database resyncs whenever an entitlement row
// moves — the booked_count pattern, pointed at standing. Nothing here stores
// a conclusion: `pass_live_until` is a date COMPARED against today, exactly
// as `paid_until` always was, so nothing rots when no write happens.
//
// Deriving from the anchor row alone is also the access story: a desk may
// know somebody holds a live subscription without any grant on the table
// that says what they pay. The roll reads `studio_people`; a roster derives
// the same words through ONE exists into it, correlated on the row's own
// (person_id, studio_id) — and `studio_people` is readable by every rung
// that shows a name.
// ═══════════════════════════════════════════════════════════════

/** A condition over the anchor's own columns, usable from any base table:
 *  local where the base IS the anchor, one correlated EXISTS otherwise. */
const anchored = (base: string, conditions: Filter[]): Filter =>
  base === 'studio_people'
    ? conditions.length === 1 && conditions[0] !== undefined
      ? conditions[0]
      : { and: conditions }
    : {
        exists: {
          from: ['studio_people'],
          filter: {
            and: [
              { eq: ['studio_people.person_id', `${base}.person_id`] },
              { eq: ['studio_people.studio_id', `${base}.studio_id`] },
              ...conditions,
            ],
          },
        },
      };

/** Works or teaches here. */
export const isStaff = (base: string): Filter => anchored(base, [{ eq: ['studio_people.works_here', true] }]);

/** A live free-trial window. */
export const trialRunning = (base: string): Filter =>
  anchored(base, [{ isNotNull: 'studio_people.trial_ends_on' }, { gte: ['studio_people.trial_ends_on', { $scope: 'today' }] }]);

/** A trial window that has closed. */
export const trialOver = (base: string): Filter =>
  anchored(base, [{ isNotNull: 'studio_people.trial_ends_on' }, { lt: ['studio_people.trial_ends_on', { $scope: 'today' }] }]);

/** A recurring entitlement in the given states. */
export const hasSubscription = (base: string, statuses: string[]): Filter => {
  const arms: Filter[] = [];
  if (statuses.includes('active')) arms.push({ gt: ['studio_people.active_subscriptions', 0] });
  if (statuses.includes('paused')) arms.push({ gt: ['studio_people.paused_subscriptions', 0] });
  const one = arms[0];
  return anchored(base, [arms.length === 1 && one !== undefined ? one : { or: arms }]);
};

/** Any subscription row at all, whatever its state — the mark a member
 *  leaves behind, which is what "past member" is derived from. */
export const holdsAnySubscription = (base: string): Filter => anchored(base, [{ gt: ['studio_people.held_subscriptions', 0] }]);

/** Credits left on a pass that has not expired — the drop-in and the ten-pack.
 *  The mirror holds the HORIZON; today is the read's to compare. */
export const hasLivePass = (base: string): Filter =>
  anchored(base, [{ isNotNull: 'studio_people.pass_live_until' }, { gte: ['studio_people.pass_live_until', { $scope: 'today' }] }]);

/** A seat in a block that has not finished. */
export const onACourse = (base: string): Filter =>
  anchored(base, [{ isNotNull: 'studio_people.enrolled_until' }, { gte: ['studio_people.enrolled_until', { $scope: 'today' }] }]);

/** Dealt with, not trained: supplier, guardian, professional, guest. */
export const isContact = (base: string): Filter => anchored(base, [{ eq: ['studio_people.deals_here', true] }]);

/** Once held an entitlement, holds nothing live now — reached only after
 *  every live arm above has said no. */
const heldSomethingOnce = (base: string): Filter =>
  anchored(base, [
    {
      or: [
        { gt: ['studio_people.held_subscriptions', 0] },
        { gt: ['studio_people.held_passes', 0] },
        { gt: ['studio_people.held_enrolments', 0] },
      ],
    },
  ]);

/** The one word, in priority order. A live trial outranks the subscription a
 *  studio may have started alongside it — the desk's question during a trial
 *  is "will they stay", not "are they paying". A closed trial does NOT: the
 *  person who trialled and signed is simply active. */
export const standingOver = (base: string): Record<string, ComputeExpression> => ({
  standing: {
    case: {
      when: [
        { condition: isStaff(base), then: 'staff' },
        { condition: trialRunning(base), then: 'trialling' },
        { condition: hasSubscription(base, ['active']), then: 'active' },
        { condition: hasSubscription(base, ['paused']), then: 'paused' },
        { condition: hasLivePass(base), then: 'pass' },
        { condition: onACourse(base), then: 'course' },
        { condition: trialOver(base), then: 'trial-over' },
        { condition: isContact(base), then: 'contact' },
        { condition: heldSomethingOnce(base), then: 'left' },
      ],
      else: 'prospect',
    },
  },
});

/** The roll's default derivation — reads FROM studio_people. */
export const STANDING: Record<string, ComputeExpression> = standingOver('studio_people');

// ── how it reads, and what colour it wears ───────────────────
// The words come from here and nowhere else: a private vocabulary in a screen
// is how three screens come to describe the same person three ways.
export const standingLabel = (standing: unknown): Record<string, unknown> => ({
  $case: {
    branches: [
      { when: { $eq: [standing, 'staff'] }, then: 'Staff' },
      { when: { $eq: [standing, 'trialling'] }, then: 'On trial' },
      { when: { $eq: [standing, 'active'] }, then: 'Active' },
      { when: { $eq: [standing, 'paused'] }, then: 'Paused' },
      { when: { $eq: [standing, 'pass'] }, then: 'Pass holder' },
      { when: { $eq: [standing, 'course'] }, then: 'On a course' },
      { when: { $eq: [standing, 'trial-over'] }, then: 'Trial over' },
      { when: { $eq: [standing, 'contact'] }, then: 'Contact' },
      { when: { $eq: [standing, 'left'] }, then: 'Left' },
    ],
    else: 'Prospect',
  },
});

export const standingTone = (standing: unknown): Record<string, unknown> => ({
  $case: {
    branches: [
      { when: { $eq: [standing, 'staff'] }, then: 'neutral' },
      { when: { $eq: [standing, 'trialling'] }, then: 'calm' },
      { when: { $eq: [standing, 'active'] }, then: 'good' },
      { when: { $eq: [standing, 'paused'] }, then: 'neutral' },
      { when: { $eq: [standing, 'pass'] }, then: 'good' },
      { when: { $eq: [standing, 'course'] }, then: 'good' },
      { when: { $eq: [standing, 'trial-over'] }, then: 'warn' },
      { when: { $eq: [standing, 'contact'] }, then: 'neutral' },
      { when: { $eq: [standing, 'left'] }, then: 'neutral' },
    ],
    else: 'calm',
  },
});
