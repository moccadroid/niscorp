import type { ComputeExpression, Filter } from '@niscorp/vex';

// Standing is derived from the mirror columns on `studio_people` alone, so a
// rung can know somebody holds a live subscription without any grant on the
// table that says what they pay.
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

export const isStaff = (base: string): Filter => anchored(base, [{ eq: ['studio_people.works_here', true] }]);

export const trialRunning = (base: string): Filter =>
  anchored(base, [{ isNotNull: 'studio_people.trial_ends_on' }, { gte: ['studio_people.trial_ends_on', { $scope: 'today' }] }]);

export const trialOver = (base: string): Filter =>
  anchored(base, [{ isNotNull: 'studio_people.trial_ends_on' }, { lt: ['studio_people.trial_ends_on', { $scope: 'today' }] }]);

export const hasSubscription = (base: string, statuses: string[]): Filter => {
  const arms: Filter[] = [];
  if (statuses.includes('active')) arms.push({ gt: ['studio_people.active_subscriptions', 0] });
  if (statuses.includes('paused')) arms.push({ gt: ['studio_people.paused_subscriptions', 0] });
  const one = arms[0];
  return anchored(base, [arms.length === 1 && one !== undefined ? one : { or: arms }]);
};

export const holdsAnySubscription = (base: string): Filter => anchored(base, [{ gt: ['studio_people.held_subscriptions', 0] }]);

export const hasLivePass = (base: string): Filter =>
  anchored(base, [{ isNotNull: 'studio_people.pass_live_until' }, { gte: ['studio_people.pass_live_until', { $scope: 'today' }] }]);

export const onACourse = (base: string): Filter =>
  anchored(base, [{ isNotNull: 'studio_people.enrolled_until' }, { gte: ['studio_people.enrolled_until', { $scope: 'today' }] }]);

export const isContact = (base: string): Filter => anchored(base, [{ eq: ['studio_people.deals_here', true] }]);

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

// In priority order. A live trial outranks a subscription started alongside
// it; a closed trial does not.
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

export const STANDING: Record<string, ComputeExpression> = standingOver('studio_people');

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
