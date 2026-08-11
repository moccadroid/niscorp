import type { ScopeBehaviors } from '@niscorp/vex';

// Row behaviors — the tenant boundary, enforced engine-side.
//
// These compile (via vex's createScopePolicy) into the ScopePolicy the server
// applies AFTER a query is authored: a `match` becomes a WHERE the query author
// can neither see nor forge, ANDed onto whatever the query already had. The
// value a `to:` resolves against comes from the scope context moss injects,
// which includes `studioId`, derived per principal from the directory (app.ts).
//
// So `{ match: 'studio_id', to: 'studioId' }` on `memberships` means every read
// of memberships gains `AND memberships.studio_id = <the caller's studio>`. An
// owner at Lumen who hand-POSTs `context.studioId = 'st_northrock'` to the raw
// vex surface gets `studio_id = 'st_northrock' AND studio_id = 'st_lumen'` —
// empty. The boundary holds identically through the shell and through curl,
// because the scope value is server-side and unreferenceable by the request.
//
// This matters more here than in most apps. Lyra's customers are competitors:
// two studios three streets apart, both on this deployment, and one of them
// seeing the other's member list is not a bug report, it is the end of the
// business. So the rule is uniform and boring on purpose — every table that
// holds a studio's data is scoped the same way, and there is no table where
// somebody had to decide whether it mattered.

// Read-only reference belonging to a studio.
const tenantRead = { read: [{ match: 'studio_id', to: 'studioId' }] };

// Writable tenant tables also PIN the studio on write: `set` stamps studio_id
// from scope on every insert and update, so a client cannot write a row INTO
// another studio; `match` filters which existing rows an update may touch. The
// consequence worth stating: no form in this application ever carries a
// studio_id, because the engine supplies it.
const tenantWrite = {
  read: [{ match: 'studio_id', to: 'studioId' }],
  write: [
    { set: 'studio_id', to: 'studioId' },
    { match: 'studio_id', to: 'studioId' },
  ],
};

// The one PERSONAL shape: pinned to the CALLER, not just to their studio.
//
// This is what a role-blind behaviors map can express and what it cannot. It
// cannot say "person_id = the caller, but only for members" — one rule per
// table, every caller — which is why these rules live on tables no staff read
// touches (see the schema's member-projection section for the full argument).
// What it CAN do, it does completely: `set` stamps both values on every write
// so a member's request carries neither, and `match` filters every read and
// every update to rows already carrying them.
//
// `userId` is injected by moss for every principal; `studioId` comes from this
// app's `scope()` seam. Neither is referenceable from a request, so the pair is
// unforgeable — a member POSTing somebody else's person_id gets
// `person_id = <theirs> AND person_id = <the forged one>`, which is empty.
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

// ── ONE TABLE, TWO REACHES ───────────────────────────────────
//
// The desk reads every booking at its studio; a member reads their own. That
// used to be unsayable — a behavior was a property of the TABLE, so every rung
// holding any grant on it got the same reach — and the workaround was a second
// table with the tighter rule attached. One fact in two places, kept level by a
// trigger, and the trigger was missing in one direction until it was found: a
// member with twenty-six bookings whose screen said "Nothing booked yet".
//
// Now the rung names its reach (charter: `scoping: 'personal'`) and a table
// declares what that means for it. A table that declares no `personal` variant
// falls back to its default, which is why the shared timetable needs no entry.
const ownBooking = {
  read: [
    { match: 'studio_id', to: 'studioId' },
    { match: 'membership_id', to: 'membershipId' },
  ],
  write: [
    { set: 'membership_id', to: 'membershipId' },
    { match: 'membership_id', to: 'membershipId' },
    { set: 'studio_id', to: 'studioId' },
    { match: 'studio_id', to: 'studioId' },
  ],
};

export const scopeBehaviors: ScopeBehaviors = {
  // ── the member's own, on the real tables ──
  //
  // There were three parallel tables here — `member_cards`, `member_bookings`,
  // `member_enrolments` — carrying the `personal` rule because a rule was a
  // property of the TABLE and the real ones had to stay studio-wide for staff.
  // Reach is the rung's now, so each table below declares BOTH and the charter
  // picks.

  // ── the studio's own data ──
  staff: tenantWrite,
  plans: tenantWrite,
  programs: tenantWrite,
  class_templates: tenantWrite,
  class_sessions: tenantWrite,
  // Reach differs by rung on the READ. The WRITE stamp does not go in the
  // default, and the reason is worth keeping: a `set` rule OVERRIDES whatever
  // the caller sent, so stamping `membership_id` here would rewrite the desk's
  // "enrol Sofia" as "enrol whoever is at the desk". Identity-on-write belongs
  // to the rung that acts for itself, which is the personal profile.
  // The card's projection: read-only, and only ever the caller's.

  // TWO REACHES, because two things are meant by "book".
  //
  //   default   — the desk: reads the studio's, and books OTHER PEOPLE, so
  //               nothing is stamped and the membership comes from the request.
  //   personal  — a member: reads their own and writes their own.
  //
  // THERE WAS A THIRD, called `teaching`: studio-wide reads with a personal
  // write stamp, for staff who also train. It existed because a person was
  // flattened to ONE role, so somebody who taught here and trained here had to
  // be described by a single profile that was neither.
  //
  // They hold both roles now. The staff role gives the studio-wide read the
  // roster needs, the member role gives the personal write, and the merge is
  // the union — which is what `teaching` was hand-writing. A profile that
  // exists to paper over a modelling error stops being needed the moment the
  // model is right, and leaving it would leave a second way to say the same
  // thing that nothing keeps in step.
  bookings: {
    default: tenantWrite,
    personal: ownBooking,
  },
  enrolments: { default: tenantWrite, personal: ownBooking },

  // A membership and its money: read-only for the member, and only theirs. The
  // subscription and plan ride along because a card is that join — a plan is a
  // price list every member may see, so it stays tenant-scoped.
  memberships: {
    default: tenantWrite,
    // Their own membership row, and only it. `membershipId` is a scope value the
    // app derives from the principal, so a member asking for "my card" cannot
    // point the question at somebody else's — there is no id to pass.
    personal: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'id', to: 'membershipId' }] },
  },
  subscriptions: {
    default: tenantWrite,
    // The money hangs off the membership, so the same pin reaches it — one
    // subscription, theirs. The plan it points at rides along tenant-scoped,
    // because a price list is public to the studio.
    personal: { read: [{ match: 'studio_id', to: 'studioId' }, { match: 'membership_id', to: 'membershipId' }] },
  },
  check_ins: tenantWrite,
  // An enquiry belongs to the studio that took it, like everything else here.
  connections: tenantWrite,
  // What a studio has bought, scoped like everything else it owns.
  studio_integrations: tenantWrite,
  courses: tenantWrite,
  // What the automations leave behind. Tenant-scoped like everything else, so a
  // reflex cannot write into another studio's inbox whatever its input says.
  notifications: tenantWrite,
  automations: tenantWrite,

  // The studio row itself. Scoped on `id` rather than `studio_id`, because it
  // IS the studio — the same rule wearing the column the table actually has.
  studios: { read: [{ match: 'id', to: 'studioId' }], write: [{ match: 'id', to: 'studioId' }] },

  // THE CATALOGUE IS NOT A TENANT'S, and this is the second entry in the list
  // below rather than a scoped one above. `integrations` is the deployment's
  // list of what is on sale: the same rows for every studio, with no studio_id
  // to scope by. An EMPTY read rule is how that is said — no match, so no
  // filter — and it is safe because there is nothing private in a price list.
  // What a studio has actually bought is `studio_integrations`, which IS scoped.
  integrations: { read: [] },

  // ── deliberately NOT scoped ──
  //
  // `people` is the one that needs a reason. A person is a human, not a
  // studio's property, and the table is shared across tenants — so a
  // studio_id match is not available to write. What keeps Lumen out of North
  // Rock's member list is that every route to a person goes THROUGH
  // `memberships`, which is scoped: a query joining people to memberships
  // inherits the boundary, and a query reading people alone returns names and
  // emails with no studio attached, which is not a member list.
  //
  // That is a real residual and it is named rather than papered over: an
  // authored read of `people` alone would leak the cast. The mitigation is
  // structural — app reads are replay-only, so there is no such fingerprint
  // unless somebody writes one, and `resources.ts` does not expose people as
  // its own surface. If that ever stops being true, this is the line to
  // revisit first.
  //
  // `themes` and `theme_layouts` are platform artifacts, not a studio's rows —
  // a theme is offered to studios, not owned by one.
} satisfies ScopeBehaviors;
