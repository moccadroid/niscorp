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
  // Named for the machinery reaches: `transport` (the lab picker) reads the
  // deployment's staff; everything else keeps the tenant fence.
  staff: {
    default: tenantWrite,
    transport: { read: [] },
  },
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
    // The lab picker reads anchors deployment-wide.
    transport: { read: [] },
    // The unsubscribe write, pinned by the ENGINE to the exact pair the
    // token's HMAC verified — scope values server code supplied, never a body.
    mailer: { write: [{ match: 'studio_id', to: 'studioId' }, { match: 'person_id', to: 'personId' }] },
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
  // Things bought once that grant nothing — same shape as a pass, because the
  // question is the same: whose studio sold it, and whose record does a member
  // get to read. The member's reach reads only their own; the desk's writes are
  // stamped with the studio like every other write here.
  purchases: {
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
  outbox: {
    default: tenantWrite,
    // The provider's own voice: delivery stamps and failures land keyed by the
    // provider's message id, before any tenant is in scope.
    mailer: { read: [], write: [] },
  },
  automations: {
    default: tenantWrite,
    // The engine loads every studio's reflex rows; it schedules for all.
    scheduler: { read: [] },
  },

  // Scoped on `id` rather than `studio_id`, because it IS the studio. The
  // `identity` reach carries the same pin: by the time moss reads
  // `identity/studio`, the licensed pre-auth read has established `studioId`
  // as an engine-side scope value no request authored.
  studios: {
    default: { read: [{ match: 'id', to: 'studioId' }], write: [{ match: 'id', to: 'studioId' }] },
    identity: { read: [{ match: 'id', to: 'studioId' }] },
    transport: { read: [] },
    scheduler: { read: [] },
  },

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
  // `people` carries ONE named reach: identity, pinned to the caller's own
  // row — the engine-enforced answer to "who am I", and the pin that makes the
  // whole identity read self-scoped no matter what anybody passes. The default
  // stays rule-free (the historical posture, preserved exactly): a person is
  // shared across tenants, every route to one goes through a scoped table, and
  // whether a rung may read `people` AT ALL stays a grant the charter refuses
  // to hand to members — which is what keeps the roster refused.
  people: {
    default: {},
    identity: { read: [{ match: 'id', to: 'userId' }] },
    transport: { read: [] },
  },

  // `people`'s default is deliberately unscoped — a person is shared across tenants.
  // Every route to one goes through `studio_people` or an entitlement, all of
  // which are scoped, and `resources.ts` gives people no surface of its own. An
  // authored bare read of `people` would leak the cast; that is the line to
  // revisit first.
} satisfies ScopeBehaviors;
