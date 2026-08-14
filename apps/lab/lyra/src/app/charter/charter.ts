import type { Charter } from '@niscorp/charter';

export const CHARTER: Charter = {
  public: ['auth.login'],

  // What every principal reads regardless of relationship: the studio, its
  // look, and the schedule it advertises. None of it is private.
  base: {
    actions: ['confirm'],
    // `phrases.read` is the studio's WORDS — translations of the release's own
    // vocabulary, identical for every reader of a language. Nothing tenant, and
    // every shell needs its book to greet somebody.
    // `integrations.read` rides beside `phrases.read` because approved integrations
    // ship phrasebooks — the words are deployment vocabulary either way, and
    // the store's own surfaces were always deployment-wide reads.
    data: ['studios.read', 'themes.read', 'phrases.read', 'integrations.read', 'programs.read', 'class_sessions.read', 'class_templates.read', 'courses.read'],
  },

  // ── THE READER OF WHO SOMEBODY IS — a role nobody wears ─────
  //
  // Identity resolution has to read a person's own rows BEFORE that person has
  // a policy, and the verbs it needs (`people.read` above all) are exactly the
  // verbs the charter refuses to hand out generally — granting `people.read`
  // to members would un-refuse the roster. So the reader is its own role:
  // moss compiles it like any other and executes ONLY the entries the manifest
  // names under it (`identity/scope`, `identity/installed`), each pinned to the
  // caller's own row by the `identity` reach in behaviors.ts.
  //
  // NOBODY WEARS THIS. It is not in WEARABLE, the identity mapping cannot
  // produce it (IDENTITY_RUNGS is checked against exactly this), and the staff
  // CHECK constraint refuses the word on a row. `reads-are-vex-check` asserts
  // all three.
  identity: {
    data: ['people.read', 'studios.read', 'studio_integrations.read'],
    scoping: 'identity',
  },

  // ── THE OTHER MACHINERY ROLES — surfaces with no principal by nature ──
  //
  // Same construction as `identity`, same rules: nobody wears these, each
  // holds exactly the verbs its surface needs, each is executed only through
  // `server.executeAs` (in-process, replay-only), and widening one is a
  // charter diff somebody reviews. `reads-are-vex-check` asserts none of them
  // is wearable.
  //
  // How a session comes to exist: resolve the address, mint the nonce, spend
  // it once. A session cannot ask for any of this, because it does not exist.
  credential: {
    data: ['people.read', 'login_links.write.insert', 'login_links.write.delete'],
  },
  // What the mail provider tells us afterwards: delivery stamps, failures,
  // suppressions, and the unsubscribe click — a vendor and a mailbox owner,
  // neither of whom has a principal here.
  mailer: {
    // insert AND update on suppressions: the entry upserts, because the
    // provider's newest word (a bounce that becomes a complaint) wins in place.
    data: ['outbox.read', 'outbox.write.update', 'mail_suppressions.write.insert', 'mail_suppressions.write.update', 'studio_people.write.update'],
    scoping: 'mailer',
  },
  // The lab's login picker: anonymity choosing who to be. Gated by
  // LYRA_DEV_LOGIN in the one caller; a deployment never sets it.
  transport: {
    data: ['people.read', 'staff.read', 'studio_people.read', 'studios.read'],
    scoping: 'transport',
  },
  // The automations engine loading its reflex rows — every studio's, because
  // the engine schedules for all of them.
  scheduler: {
    data: ['automations.read', 'studios.read'],
    scoping: 'scheduler',
  },

  // A SIBLING of the staff roles, not their base — so a grant added here never
  // lands on the desk as a studio-wide read.
  member: {
    extends: ['base'],
    scoping: 'personal',
    // Landing surfaces by name, never `home.*`: a wildcard at the bottom of a
    // ladder grants to the whole ladder. This rung is what everybody the studio
    // KNOWS signs in through — the member of nine years, the prospect at the
    // plan-choice cliff, the pass holder, the supplier. What differs between
    // them is derived standing, and every read here is pinned to the caller.
    actions: ['chrome.member', 'home.member', 'me.*', 'confirm', 'ext.member.*'],
    data: [
      'studio_people.read',
      'subscriptions.read',
      // CHOOSING A PLAN THEMSELVES (Decision D2: immediate, behind a hard
      // terms confirm). The write is personal-reached — person_id is stamped
      // from the caller, so "start somebody else" is unsayable — and the
      // desk's own start fingerprint serves both, one mutation, two reaches.
      'subscriptions.write.insert',
      // LEAVING THEMSELVES — the smallest gap the remodel closes (§312k says
      // a member must be able to). One insert on the notice ledger, pinned to
      // the caller and verified against the subscription's owner; the leaving
      // date stays the trigger's arithmetic, same as from the desk.
      'subscription_notices.write.insert',
      // PAUSING THEMSELVES (Decision D4: a paused month extends the term —
      // the ledger's apply trigger owns that arithmetic). Update grants the
      // resume flag on their own rows and nothing else.
      'subscription_pauses.write.insert',
      'subscription_pauses.write.update',
      'passes.read',
      'offerings.read',
      'bookings.read',
      // Both writes stamp `person_id` and `studio_id` from scope, so neither
      // carries a subject — "book somebody else" is unsayable in the grammar.
      'bookings.write.insert',
      'bookings.write.update',
      'courses.read',
      'enrolments.read',
      'enrolments.write.insert',
      'enrolments.write.update',
      // Absent deliberately: `people.read`. No member screen needs a name but
      // their own, which the session already carries.
    ],
  },

  // ── the front desk ───────────────────────────────────────
  desk: {
    extends: ['base'],
    actions: ['chrome.staff', 'home.desk', 'people.*', 'desk.*', 'schedule.*', 'ext.desk.*'],
    data: [
      'staff.read',
      'studio_people.read',
      'people.read',
      'offerings.read',
      // Ticking a follow-up off, not writing one: automations produce them.
      'notifications.read',
      'notifications.write.update',
      // NOT `subscriptions.read`. With `offerings.read` it IS the revenue
      // query, and a fingerprint is replayable by anyone whose policy covers
      // its tables — removing the action would not be enough. The desk still
      // knows WHO IS ALLOWED ON THE MAT because standing derives from the
      // relationship MIRRORS on `studio_people` (schema.ts) — the boolean it
      // always had, without any grant on the table that says what anybody pays.
      'bookings.read',
      'check_ins.read',
      'studio_people.write.insert',
      'studio_people.write.update',
      // The desk SELLS passes — cash for a class is the front desk's bread and
      // butter — but reads them too, or it could not answer "how many left?".
      'passes.read',
      'passes.write.insert',
      // `people` is unscoped by design — a human is not a studio's property.
      // The anchor row is what binds them to this studio, and that is scoped.
      'people.write.insert',
      'people.write.update',
      'connections.read',
      'connections.write.insert',
      'connections.write.update',
      'check_ins.write.insert',
      'bookings.write.insert',
      'bookings.write.update',
      // Signs somebody up for a block; cannot decide what the block IS.
      'enrolments.read',
      'enrolments.write.insert',
      'enrolments.write.update',
    ],
  },

  // ── the instructor ───────────────────────────────────────
  instructor: {
    extends: ['base'],
    actions: ['chrome.staff', 'home.classes', 'classes.*', 'roster.*', 'schedule.*', 'desk.*'],
    // The roster says "On trial" or "Pass holder" beside a name off the
    // anchor's mirrors — no grant anywhere near a price or a supplier.
    data: ['staff.read', 'studio_people.read', 'people.read', 'bookings.read', 'check_ins.read', 'check_ins.write.insert', 'enrolments.read'],
  },

  // ── the manager ──────────────────────────────────────────
  manager: {
    extends: ['instructor', 'desk'],
    actions: ['home.overview', 'plans.*', 'programs.*', 'courses.*', 'timetable.*', 'reports.*', 'automations.*', 'studio.addons'],
    data: [
      // The read that makes revenue answerable, held here and no lower.
      'subscriptions.read',
      'class_templates.write.insert',
      'class_templates.write.update',
      'class_sessions.write.insert',
      'class_sessions.write.update',
      'programs.write.insert',
      'programs.write.update',
      'offerings.write.insert',
      'offerings.write.update',
      'courses.write.insert',
      'courses.write.update',
      // Update but no insert: people tick follow-ups, automations write them.
      'notifications.read',
      'notifications.write.update',
      'outbox.read',
      'automations.read',
      'automations.write.insert',
      'automations.write.update',
      // The vocabulary the screens are built from — what the release ships,
      // the same for everybody, and readable by anyone who may see the
      // automations at all.
      'automation_moments.read',
      'automation_effects.read',
      'automation_recipes.read',
      'tide_run.read',
      'subscriptions.write.insert',
      'subscriptions.write.update',
      // GIVING NOTICE IS ITS OWN TABLE AND SO ITS OWN GRANT. It used to be a
      // column on subscriptions, which made it indistinguishable from stating a
      // billing standing — see the stripe rung at the bottom of this file.
      'subscription_notices.read',
      'subscription_notices.write.insert',
      'subscription_notices.write.update',
      // The desk-side half of pausing — same ledger the member writes.
      'subscription_pauses.read',
      'subscription_pauses.write.insert',
      'subscription_pauses.write.update',
      // No delete verb anywhere in this app — retiring and cancelling are both
      // status changes.
    ],
  },

  // ── the owner ────────────────────────────────────────────
  owner: {
    extends: ['manager'],
    actions: ['studio.*', 'staff.*'],
    data: [
      'integrations.read',
      'studio_integrations.read',
      'studio_integrations.write.insert',
      'studio_integrations.write.update',
      'studios.write.update',
      // One verb on one table, not a permission system: the charter still
      // decides what a role means, so this screen cannot invent anything.
      'staff.write.insert',
      'staff.write.update',
      'theme_layouts.read',
    ],
  },

  // ── the automations ──────────────────────────────────────
  automation: {
    actions: [],
    data: [
      'studio_people.read',
      'subscriptions.read',
      'people.read',
      'class_sessions.read',
      'bookings.read',
      // WHOSE NAME THE MAIL GOES OUT IN. The envelope is composed by the
      // selection, not by the transport — which reads nothing at all — so the
      // studio's own name and reply address have to be readable here. Without
      // it the send is REFUSED on every run and the screen has no way to know:
      // exactly the failure the three deleted moments died of (compose.ts).
      'studios.read',
      // WHO NOT TO WRITE TO, written by the provider's own webhook. Read-only
      // here: a robot may refuse to send, never decide who is unreachable.
      'mail_suppressions.read',
      // Everything here only ADDS, and lands on a screen somebody reads —
      // EXCEPT the one below, and the exception is worth stating rather than
      // discovering.
      'outbox.write.insert',
      'outbox.read',
      // THE FIRST HOLE IN THAT SENTENCE, and a deliberate one. Sending is not
      // complete until the row says what happened, and the row must be claimed
      // ('queued' → 'sending') before the send or a retry mails somebody twice.
      // The rule this contradicts is about rows A HUMAN WROTE: `outbox` is the
      // one table in this app that no human ever writes — every row in it is an
      // automation's own — so this grant contradicts the wording and not the
      // reason. A charter grant is table.verb and cannot tell two updates
      // apart, so if a person ever gains a pen here, this comes back out.
      'outbox.write.update',
      // Telling the studio something is an ADD onto the notices list — the
      // same published fingerprint the integrations replay, on the same discipline.
      'notifications.write.insert',
    ],
  },

  // ── the integrations, acting for themselves ──────────────
  integration: {
    actions: [],
    data: [
      // Telling the studio something lands on the desk's notices list — a
      // place somebody looks. Anything more is a grant added here deliberately.
      'notifications.write.insert',
      'notifications.read',
    ],
  },

  // ── the one that handles money ───────────────────────────
  //
  // A RUNG OF ITS OWN, not a widening of the one above. Every installed integration
  // shares `integration`, so adding payment grants there would hand a rank
  // tracker the ability to move somebody's standing — and the rung an integration gets
  // is derived from its own id (app.ts), so this one is reachable only by the
  // integration actually called `stripe`.
  //
  // Extends nothing, for the same reason `automation` extends nothing: code
  // nobody is watching gets a rung drawn for it, never one borrowed from a
  // person.
  //
  // WHY IT MAY MOVE STANDING WHEN `automation` MAY NOT. The automation rung
  // deliberately holds no `memberships.write.update`: nothing unattended should
  // alter a row a human wrote. This does not — it records what a member's own
  // payment did, which no human here authored.
  //
  // AND NOTE WHAT IS ABSENT: `subscription_notices.*`. Giving notice used to be
  // a column on `subscriptions`, which made it the same grant as stating a
  // standing — a charter grant is table.verb and cannot tell two updates on one
  // table apart, so this rung could have ended somebody's membership. Notice is
  // its own table for exactly that reason, and this rung does not hold it.
  stripe: {
    actions: [],
    data: [
      'subscriptions.read',
      // The verb; `subscriptions/assert` is the only shape of it that exists,
      // and it sets standing — never terms, never a notice.
      'subscriptions.write.update',
      'offerings.read',
      'studio_people.read',
      // For the checkout email, and nothing else asks for a person here.
      'people.read',
      // Dunning outcomes land on the desk's list, where somebody looks.
      'notifications.write.insert',
    ],
  },
};
