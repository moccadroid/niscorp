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

// ── ME AND MINE ──────────────────────────────────────────────
//
// `personal` for somebody answerable for other people — a parent and their
// children. The READ widens from one person to a set the session resolved
// once at sign-in (`householdIds`, identity.entries.ts): caller-plus-guarded,
// pinned to the guardian side, so it cannot be widened by asking differently.
//
// THE WRITE DELIBERATELY CARRIES NO PERSON RULE, and that is the whole design
// rather than an omission. `personal` STAMPS `person_id` from the caller,
// which is what makes "book somebody else" unsayable rather than merely
// refused — an overwrite cannot be forgotten. A set cannot stamp, so the
// obvious move is to swap the stamp for a check against the set — and a check
// is something a future author can forget to write.
//
// So neither: the subject arrives through a `$lookup` on `guardianships`,
// whose own read rules the engine ANDs into the subquery. A subject the
// caller does not guard resolves NULL and the insert dies on NOT NULL. The
// subject is engine-pinned, exactly as it was before; only the source of the
// pin moved. vex refuses a set-valued rule on an INSERT outright, so this
// cannot quietly become the other thing.
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

// The same, for a table read at the household reach that a household member
// never writes — the mirror rows the family surface only ever displays.
const householdRead = { read: household.read };

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
    household,
  },
  enrolments: { default: tenantWrite, personal, household },

  studio_people: {
    default: tenantWrite,
    personal: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'person_id', to: 'userId' }] },
    household: householdRead,
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
    // READ ONLY at the household reach, deliberately. A parent SEES what their
    // child holds; starting or ending a child's plan stays the desk's, because
    // it is a commitment about money and the switcher is not where a family
    // should discover they have made one. The columns to widen it are here
    // when somebody decides otherwise.
    household: householdRead,
  },
  passes: {
    default: tenantWrite,
    personal: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'person_id', to: 'userId' }] },
    household: householdRead,
  },
  // Things bought once that grant nothing — same shape as a pass, because the
  // question is the same: whose studio sold it, and whose record does a member
  // get to read. The member's reach reads only their own; the desk's writes are
  // stamped with the studio like every other write here.
  purchases: {
    default: tenantWrite,
    personal: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'person_id', to: 'userId' }] },
    household: householdRead,
  },
  // Notice belongs to the studio whose subscription it ends; the point of the
  // separate table is the VERB. On the member's reach the caller is pinned
  // into `person_id`, and the stamp trigger verifies it against the
  // subscription's owner — their own contract, nobody else's.
  subscription_notices: {
    default: tenantWrite,
    personal,
    household,
  },
  // The pause ledger, same fence, same reason — see the table's own comment
  // for why freezing training must not be the grant that states standings.
  subscription_pauses: {
    default: tenantWrite,
    personal,
    household,
  },
  check_ins: tenantWrite,
  connections: tenantWrite,
  // WHO MAY ACT FOR WHOM. The desk writes these; nobody else does yet.
  //
  // The named reaches below are what a guardian's own session is built from,
  // and both are pinned to the GUARDIAN side — never the child's. That
  // direction is the whole security property: `guardian_person_id = userId`
  // means a caller can only ever discover the children THEY are answerable
  // for, so the set a reach resolves from cannot be widened by asking
  // differently.
  //
  // `identity` is how the session learns its own household (identity.entries),
  // and `personal` is how a member's own screen lists their children — the
  // same rows, the same pin, read at the two reaches that need them.
  guardianships: {
    default: tenantWrite,
    identity: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'guardian_person_id', to: 'userId' }] },
    personal: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'guardian_person_id', to: 'userId' }] },
    // THE WRITE-SUBJECT PIN, and the reason a parent booking for a child is
    // safe without a set-valued write rule. A `$lookup` on this table at the
    // household reach carries these read matches into its own subquery
    // (vex mutations/engine.ts), so a subject the caller does not guard
    // resolves NULL and the insert dies on NOT NULL. The engine applies it;
    // no entry can forget it.
    household: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'guardian_person_id', to: 'userId' }] },
  },
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
    // A MEMBER MAY NOW READ A PERSON, AND ONLY EVER THESE PEOPLE.
    //
    // The member rung holds `people.read` so a parent can see their child's
    // NAME — which is otherwise unreadable anywhere, because a name lives on
    // `people` and nothing else. That grant is only safe because of these two
    // lines: at `personal` a member reads their own row, at `household` their
    // own and their children's. The roster stays refused by the ROW RULE
    // rather than by the absence of the verb.
    //
    // BOTH VARIANTS OR NEITHER. `people`'s default is deliberately rule-free —
    // a person is shared across tenants — so a reach that names no variant
    // here falls through to NO RULES AT ALL and reads the whole deployment.
    // That is the worst fall-through in this file, and `reach-coverage-check`
    // is what stops one being added without the other.
    personal: { read: [{ match: 'id', to: 'userId' }] },
    household: { read: [{ match: 'id', in: 'householdIds' }] },
    transport: { read: [] },
  },

  // `people`'s default is deliberately unscoped — a person is shared across tenants.
  // Every route to one goes through `studio_people` or an entitlement, all of
  // which are scoped, and `resources.ts` gives people no surface of its own. An
  // authored bare read of `people` would leak the cast; that is the line to
  // revisit first.
} satisfies ScopeBehaviors;
