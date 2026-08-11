// Vex resources — the scoped query surfaces, mounted at /api/<name>/vex.
//
// A resource is a set of entities that belong together. Lyra wires no
// generation hooks, so every request cache-hits a seeded fingerprint and these
// filters bite on discovery alone — but they are still the honest statement of
// which tables travel together, and they are the boundary a future agent path
// would be held to.
//
// Note what has no resource of its own: `people`. It is reachable only through
// `member`, alongside the scoped `memberships` that constrains it. That is
// deliberate and it is the other half of the residual named in behaviors.ts —
// there is no surface on which a bare people query could be discovered.
export const RESOURCES: Record<string, { entities: readonly string[] }> = {
  studio: { entities: ['studios', 'memberships', 'check_ins', 'subscriptions', 'plans', 'themes', 'integrations', 'studio_integrations'] },
  member: { entities: ['memberships', 'people', 'subscriptions', 'plans'] },
  // People the studio only DEALS with. Its own surface because a connection is
  // not a member and must never ride along on a read about the roll.
  connections: { entities: ['connections', 'people'] },
  schedule: { entities: ['courses', 'enrolments', 'class_sessions', 'class_templates', 'programs', 'staff', 'bookings', 'memberships', 'people', 'check_ins'] },
  // Who works here, and what they may do. Its own surface because it is the
  // one place a write changes somebody else's application.
  staff: { entities: ['staff', 'people'] },

  // The member's own. Two tables nothing else in this application reads, which
  // is the entire security argument: `me/card` cannot be widened into the roll
  // by any query, because there is no roll on this resource to widen it into.
  //
  // `class_sessions` and its reference tables ride along so a member can see
  // what there is to book. Those are studio-scoped, not person-scoped, and
  // that is correct — a timetable is what a studio advertises.
  // `bookings` rides here now, and the guarantee changed shape with it. It used
  // to be "the table is not on your resource" — a member could not widen a
  // query into the roll because the roll was not reachable. It is now "the rows
  // are not yours", enforced by the rung's reach on any surface.
  //
  // The resource stays NARROW anyway: `memberships` and `people` are still
  // absent, so a bookings read cannot join its way to a name. Two reasons is
  // better than one, and this is the one that survived.
  me: { entities: ['memberships', 'subscriptions', 'plans', 'bookings', 'enrolments', 'courses', 'class_sessions', 'class_templates', 'programs'] },

  // What the automations touch. A resource of its own so the surface an
  // unattended principal uses is one visible thing, and so nothing a person
  // browses carries the notifications table along by accident.
  automation: { entities: ['memberships', 'people', 'subscriptions', 'bookings', 'class_sessions', 'notifications', 'automations'] },
};
