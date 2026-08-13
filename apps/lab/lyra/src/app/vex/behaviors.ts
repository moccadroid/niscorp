import type { ScopeBehaviors } from '@niscorp/vex';

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

export const scopeBehaviors: ScopeBehaviors = {
  // ── the studio's own data ──
  staff: tenantWrite,
  offerings: tenantWrite,
  programs: tenantWrite,
  class_templates: tenantWrite,
  class_sessions: tenantWrite,

  // No write stamp in the default: a `set` rule OVERRIDES what the caller sent,
  // so stamping person_id here rewrites the desk's "enrol Sofia" as "enrol
  // whoever is at the desk". The personal reach pins everything to the caller.
  bookings: {
    default: tenantWrite,
    personal,
  },
  enrolments: { default: tenantWrite, personal },

  studio_people: {
    default: tenantWrite,
    personal: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'person_id', to: 'userId' }] },
  },
  subscriptions: {
    default: tenantWrite,
    // The personal WRITE is what makes "choose a plan yourself" safe to grant:
    // person_id is SET from the caller's own identity — overriding whatever a
    // request carried — so the same `subscriptions/start` the desk replays
    // starts only the caller's own subscription at a member's reach.
    personal: {
      read: [{ match: 'studio_id', to: 'studioId' }, { match: 'person_id', to: 'userId' }],
      write: [
        { set: 'person_id', to: 'userId' },
        { match: 'person_id', to: 'userId' },
        { set: 'studio_id', to: 'studioId' },
        { match: 'studio_id', to: 'studioId' },
      ],
    },
  },
  passes: {
    default: tenantWrite,
    personal: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'person_id', to: 'userId' }] },
  },
  // Notice belongs to the studio whose subscription it ends; the point of the
  // separate table is the VERB. On the member's reach the caller is pinned
  // into `person_id`, and the stamp trigger verifies it against the
  // subscription's owner — their own contract, nobody else's.
  subscription_notices: {
    default: tenantWrite,
    personal,
  },
  // The pause ledger, same fence, same reason — see the table's own comment
  // for why freezing training must not be the grant that states standings.
  subscription_pauses: {
    default: tenantWrite,
    personal,
  },
  check_ins: tenantWrite,
  connections: tenantWrite,
  studio_integrations: tenantWrite,
  courses: tenantWrite,
  // What the automations leave behind — scoped, so a reflex cannot write into
  // another studio's inbox whatever its input says.
  notifications: tenantWrite,
  outbox: tenantWrite,
  automations: tenantWrite,

  // Scoped on `id` rather than `studio_id`, because it IS the studio.
  studios: { read: [{ match: 'id', to: 'studioId' }], write: [{ match: 'id', to: 'studioId' }] },

  tide_run: { read: [{ match: 'as_who', to: 'automationActor' }] },

  // Deployment-wide catalogue: no studio_id to scope by, and nothing private in
  // a price list. What a studio BOUGHT is `studio_integrations`, which is scoped.
  integrations: { read: [] },

  // ── deliberately NOT scoped ──
  // The automation VOCABULARY — moments, effects, recipes — is what the
  // release ships, identical for every studio and owned by none of them. It
  // carries no `studio_id` to match on and nothing in it is anybody's data:
  // scoping it would mean inventing a tenant column for a constant. What IS
  // scoped is every row that points at it (`automations`), which is where a
  // studio's own words and hours live.
  //
  // `people` is deliberately unscoped — a person is shared across tenants.
  // Every route to one goes through `studio_people` or an entitlement, all of
  // which are scoped, and `resources.ts` gives people no surface of its own. An
  // authored bare read of `people` would leak the cast; that is the line to
  // revisit first.
} satisfies ScopeBehaviors;
