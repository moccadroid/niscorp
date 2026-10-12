import type { ScopeBehaviors, ScopeMatch, ScopeRule } from '@niscorp/vex';

const tenantRead = { read: [{ match: 'studio_id', to: 'studioId' }] };

const tenantWrite = {
  read: [{ match: 'studio_id', to: 'studioId' }],
  write: [
    { set: 'studio_id', to: 'studioId' },
    { match: 'studio_id', to: 'studioId' },
  ],
};

const personal = {
  read: [
    { match: 'person_id', to: 'userId' },
    { match: 'studio_id', to: 'studioId' },
  ],
  write: [
    { set: 'person_id', to: 'userId' },
    { match: 'person_id', to: 'userId' },
    { set: 'studio_id', to: 'studioId' },
    { match: 'studio_id', to: 'studioId' },
  ],
};

// The write carries no person rule on purpose: a set cannot stamp `person_id`,
// and vex refuses a set-valued rule on an INSERT. An insert's subject is pinned
// by a `$lookup` on `guardianships` instead.
const household: { read: ScopeMatch[]; write: ScopeRule[] } = {
  read: [
    { match: 'person_id', in: 'householdIds' },
    { match: 'studio_id', to: 'studioId' },
  ],
  write: [
    { set: 'studio_id', to: 'studioId' },
    { match: 'studio_id', to: 'studioId' },
  ],
};

const householdRead = { read: household.read };

export const scopeBehaviors: ScopeBehaviors = {
  // `transport` (the dev-login roster) has no rule: it reads all studios' staff.
  staff: {
    default: tenantWrite,
    transport: { read: [] },
  },
  offerings: tenantWrite,
  programs: tenantWrite,
  class_templates: tenantWrite,
  class_sessions: tenantWrite,

  // The default does not stamp `person_id`: a `set` rule overrides what the
  // caller sent, and the desk's "enrol Sofia" would enrol whoever is at the desk.
  bookings: {
    default: tenantWrite,
    personal,
    household,
  },
  enrolments: { default: tenantWrite, personal, household },

  studio_people: {
    default: tenantWrite,
    personal: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'person_id', to: 'userId' }] },
    household: householdRead,
    transport: { read: [] },
    // The unsubscribe write, pinned to the pair the token's HMAC verified:
    // scope values server code supplies, never a request body.
    mailer: { write: [{ match: 'studio_id', to: 'studioId' }, { match: 'person_id', to: 'personId' }] },
  },
  subscriptions: {
    default: tenantWrite,
    // `person_id` is set from the caller, overriding what the request carried:
    // at a member's reach `subscriptions/start` starts only the caller's own.
    personal: {
      read: [{ match: 'studio_id', to: 'studioId' }, { match: 'person_id', to: 'userId' }],
      write: [
        { set: 'person_id', to: 'userId' },
        { match: 'person_id', to: 'userId' },
        { set: 'studio_id', to: 'studioId' },
        { match: 'studio_id', to: 'studioId' },
      ],
    },
    // Read only: a parent sees what their child holds, and starting or ending
    // a child's plan, a commitment about money, stays the desk's.
    household: householdRead,
  },
  passes: {
    default: tenantWrite,
    personal: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'person_id', to: 'userId' }] },
    household: householdRead,
  },
  purchases: {
    default: tenantWrite,
    personal: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'person_id', to: 'userId' }] },
    household: householdRead,
  },
  // At the member's reach the caller is pinned into `person_id`, and the
  // table's stamp trigger verifies it against the subscription's owner.
  subscription_notices: {
    default: tenantWrite,
    personal,
    household,
  },
  subscription_pauses: {
    default: tenantWrite,
    personal,
    household,
  },
  check_ins: tenantWrite,
  connections: tenantWrite,
  // Every named reach pins the guardian side, never the child's: a caller can
  // only discover the children they are answerable for.
  guardianships: {
    default: tenantWrite,
    identity: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'guardian_person_id', to: 'userId' }] },
    personal: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'guardian_person_id', to: 'userId' }] },
    // A `$lookup` at the household reach ANDs these matches into its subquery:
    // a child the caller does not guard resolves NULL and the insert fails.
    household: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'guardian_person_id', to: 'userId' }] },
  },
  studio_integrations: tenantWrite,
  courses: tenantWrite,
  notifications: tenantWrite,
  outbox: {
    default: tenantWrite,
    // Unscoped: the mail provider's delivery stamps and failures land keyed by
    // its message id, before any tenant is in scope.
    mailer: { read: [], write: [] },
  },
  automations: {
    default: tenantWrite,
    // Unscoped: the scheduler loads every studio's reflex rows.
    scheduler: { read: [] },
  },
  campaigns: tenantWrite,

  studios: {
    default: { read: [{ match: 'id', to: 'studioId' }], write: [{ match: 'id', to: 'studioId' }] },
    identity: { read: [{ match: 'id', to: 'studioId' }] },
    transport: { read: [] },
    scheduler: { read: [] },
  },

  tide_run: { read: [{ match: 'as_who', to: 'automationActor' }] },

  // The deployment-wide catalogue, with nothing private in it. What a studio
  // installed is `studio_integrations`, which is scoped.
  integrations: { read: [] },

  // The default has no rule: a person is shared across tenants, and every route
  // to one goes through a scoped table.
  people: {
    default: {},
    identity: { read: [{ match: 'id', to: 'userId' }] },
    // Both variants or neither: a reach that names no variant here falls
    // through to the default and reads every person in the deployment.
    personal: { read: [{ match: 'id', to: 'userId' }] },
    household: { read: [{ match: 'id', in: 'householdIds' }] },
    transport: { read: [] },
  },
} satisfies ScopeBehaviors;
