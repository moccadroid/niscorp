import type { Charter } from '@niscorp/charter';

// Lyra's charter — the CEILING, not the arrangement.
//
// Two sections, one grammar: `actions` selects which nova action ids exist for
// a principal, `data` selects the vex verb leaves their scope policy is
// compiled from. What a role may EVER hold is here; what is actually on screen
// right now is the shell's business.
//
// Read the roles as a ladder with one deliberate break in it. Desk extends
// member, manager extends instructor, owner extends manager — each rung adding
// what the one below cannot do. The break is `member`: a member is not the
// bottom of the staff ladder, because almost everything a member can do is
// about THEIR OWN row, and almost everything staff do is about everybody's.
// The engine draws that line, not this file (see vex/behaviors.ts) — but the
// charter has to stop short of pretending one is a weaker version of the other.
//
// What is absent and stays absent: no role reads `people` rows outside its own
// studio, because there is no such grant to give. Tenancy is not a rule in this
// document; it is a property of every compiled policy.
export const CHARTER: Charter = {
  // Anonymous. One action: the way in. A person holding nothing gets an
  // application consisting entirely of a login page, by derivation rather than
  // by a redirect somebody wrote.
  public: ['auth.login'],

  // ── the member ───────────────────────────────────────────
  // Their own membership, the studio's public schedule, and the ability to
  // take or give up a place. Note what is missing: no read of another
  // member, no attendance but their own, and no write to a class.
  // ── anybody at the studio ─────────────────────────────────
  //
  // What every principal reads whatever their relationship: the studio itself,
  // its look, and the timetable it advertises. None of it is private and none
  // of it is a member's in particular.
  //
  // THIS EXISTS BECAUSE `member` USED TO BE THE FLOOR. Every staff rung extended
  // it, which quietly redefined "member" from *somebody with a membership* into
  // *the minimum anybody gets* — so a grant a member needed for their own card
  // landed on the desk as a studio-wide read, and the takings leaked. A member
  // is a RELATIONSHIP now, held alongside a staff role by anybody who has one;
  // this is the floor.
  base: {
    actions: ['confirm'],
    data: ['studios.read', 'themes.read', 'programs.read', 'class_sessions.read', 'class_templates.read', 'courses.read'],
  },

  member: {
    extends: ['base'],
    // Landing surfaces are granted BY NAME, never as `home.*`.
    //
    // The wildcard was the bug: every staff role extends member, so `home.*` at
    // this rung handed an instructor the owner's dashboard — headcount and
    // expected monthly revenue on the screen of somebody who teaches Tuesday
    // evenings. A wildcard at the bottom of a ladder grants to the whole ladder,
    // which is exactly what it looks like it does and exactly what nobody reads
    // it as.
    // `confirm` sits at the bottom rung because anybody can be asked a question.
    // It performs nothing and holds no grant to what it protects — the opener
    // does the work when it hears the answer.
    // HOW FAR THIS RUNG REACHES. A member acts for themselves, whatever they
    // are reading — so it is said once here rather than repeated on every
    // grant, and it is deliberately NOT inherited by the rungs that extend
    // this one: a desk holds a member's screens and must not hold a member's
    // "only my own rows", or the roster it exists to read would filter to the
    // one person operating it.
    scoping: 'personal',
    actions: ['chrome.member', 'home.member', 'me.*', 'confirm', 'ext.member.*'],

    // ── WHAT A MEMBER MAY READ, AND WHY IT IS SAFE ──────────
    //
    // Charter verbs are TABLE-level (`memberships.read`), reads are replay-only
    // by fingerprint, and a fingerprint is replayable by ANYONE whose policy
    // covers the tables it touches. So a grant here is not "this screen may show
    // it" — it is "this rung may ask the database for it, by hand, at the vex
    // surface". A member holding `memberships.read` under a studio-wide rule
    // could POST `members/list` and receive the entire roll: every name, every
    // email, and the notes the desk writes about people ("card expired, no reply
    // to two emails"). That was live once; `scope-check` asserts it is closed.
    //
    // TWO THINGS CLOSE IT, and they are different in kind.
    //
    // Reach closes the ROW: `scoping: 'personal'` above pins every table this
    // rung reads to the caller's membership, so `members/list` replayed by a
    // member returns their own row rather than the roll. Reach is not inherited
    // by the rungs that extend a role, which is why a desk holding the same
    // screens still reads the whole roster.
    //
    // The LADDER closes the direction of travel: this rung is a SIBLING of the
    // staff roles, not their base. Both stand on `base`, and a person who is
    // both — an instructor who trains here — holds both roles rather than being
    // flattened to one. That is what makes `subscriptions.read` sayable at all;
    // while `member` was the bottom rung, every grant on it landed on the desk
    // as a studio-wide read, and the desk deliberately holds `plans.read`
    // WITHOUT `subscriptions.read` because the two together are the takings.
    //
    // Still absent, deliberately: `people.read`. Reach would pin it, but the
    // strongest boundary is a verb that was never issued, and no member screen
    // needs a name but their own — which the session already carries.
    //
    // `themes.read` sits at the bottom because EVERYONE sees the studio's look
    // — a member wears the same palette as the owner. Themes are a platform
    // catalog, not a studio's private data, so reading them leaks nothing.
    // Which theme a studio WEARS is a write, and that stays with the owner.
    data: [
      // Their own, and only ever their own.
      // THE REAL TABLE, filtered to their own rows by the rung's reach.
      //
      // This is the grant `member_bookings` existed to avoid. The desk holds
      // the same string and reads the whole studio; a member holds it and
      // reads twenty-three rows, because the rung says `scoping: 'personal'`
      // and the table declares what that means. Same fingerprint, same
      // endpoint, different WHERE — decided by the charter, injected by the
      // engine, unreachable from the query.
      // The card's projection — see me.entries.ts for why this one survived.
      // The card, read as the join it is. Safe on this rung ONLY because the
      // rung is a sibling of the staff roles rather than their base — the desk
      // holds `plans.read` without `subscriptions.read` deliberately, and this
      // grant no longer travels up to meet it.
      'memberships.read',
      'subscriptions.read',
      'plans.read',
      'bookings.read',
      // Booking themselves in and cancelling. Both writes stamp `person_id`
      // and `studio_id` from scope, so neither carries a subject — a member
      // has no way to express "book somebody else" in the grammar at all.
      'bookings.write.insert',
      'bookings.write.update',
      // Courses are advertised, like the timetable — reading what a studio
      // sells leaks nothing. Joining one is a personal table, same as booking.
      'courses.read',
      'enrolments.read',
      'enrolments.write.insert',
      'enrolments.write.update',
    ],
  },

  // ── the front desk ───────────────────────────────────────
  // The first role that sees other people. Everything about who is here today,
  // who is due, and putting somebody on a list. Not: money, plans, or the shape
  // of the schedule.
  desk: {
    extends: ['base'],
    // THE FENCE FOR INTEGRATIONS, drawn once and never edited again.
    //
    // An integration ships actions nobody had heard of when this was written,
    // so no id here can name them. The glob is the ceiling instead: anything an
    // integration puts in front of a desk lands inside 'ext.desk.', and nothing
    // it ships can land anywhere else — intake refuses a bundle claiming a
    // namespace that is not its own.
    //
    // This is deployment-wide. Which integrations a STUDIO has is a separate
    // question with a separate answer (studio_integrations), because a glob
    // cannot say 'the ones this tenant bought'.
    actions: ['chrome.staff', 'home.desk', 'people.*', 'leads.*', 'desk.*', 'schedule.*', 'ext.desk.*'],
    data: [
      'staff.read',
      // The roll — and this is the first rung that gets it, deliberately.
      'memberships.read',
      'people.read',
      'plans.read',
      // NOT `subscriptions.read`. It looks harmless next to `plans.read`, and
      // together they ARE the revenue query — sum the price of every plan an
      // active subscription points at. Holding both is holding the takings,
      // whether or not any screen shows them, because a fingerprint is
      // replayable by anyone whose policy covers the tables it touches.
      //
      // So the split is: the desk sees what the studio SELLS (plans), the
      // manager sees what it EARNS (plans × subscriptions). Removing the action
      // would not have been enough.
      //
      // The member rung DOES name `subscriptions.read` — but at personal reach, so
      // replaying the revenue fingerprint as a member returns their own bill and
      // not the sum. Same verb, different rung, different answer; `multirole-check`
      // asserts the three figures stay apart. This rung has no personal reach by
      // design, which is exactly why it must not hold the verb.
      'bookings.read',
      'check_ins.read',
      'memberships.write.insert',
      'memberships.write.update',
      // Signing somebody up IS the desk's job, so creating the person is too.
      // `people` is unscoped by design — a human is not a studio's property —
      // and what binds them to this studio is the membership, which is.
      'people.write.insert',
      'people.write.update',
      // ENQUIRIES ARE THE DESK'S JOB. Somebody asks about prices at the counter
      // and the person who takes the call is the person who writes it down —
      // putting this a rung higher would mean the enquiry never gets recorded.
      'connections.read',
      'connections.write.insert',
      'connections.write.update',
      // Checking somebody in — the desk's verb, and the one it uses all day.
      'check_ins.write.insert',
      'bookings.write.insert',
      'bookings.write.update',
      // The desk signs somebody up for a block at the counter, the same way it
      // books a class. What it cannot do is decide what the block IS.
      'enrolments.read',
      'enrolments.write.insert',
      'enrolments.write.update',
    ],
  },

  // ── the instructor ───────────────────────────────────────
  // Their mat, their roster. An instructor sees who is booked into the classes
  // they teach and marks attendance; they do not administer memberships.
  instructor: {
    extends: ['base'],
    // `home.classes` is taken BY NAME here rather than inherited from the
    // member rung, which is where it used to sit. That was the `home.*` bug in
    // a quieter form: a landing surface at the bottom of a ladder is a landing
    // surface for everybody standing above it, so a member was being handed the
    // instructor's day. The member now has `home.member`; this rung says out
    // loud which screen it lands on.
    // The read-only calendar is a STAFF view. It used to sit at the member rung,
    // which gave a member a Schedule tab showing the same classes their Book tab
    // already lists — two destinations, one list. A member's schedule IS the
    // booking screen; this is where the calendar belongs.
    // `hub.schedule` is what makes `schedule.*` reachable. Without it this rung
    // held the timetable and had no way to open it — a grant with no
    // destination, the same fault that left a teacher's own card unreachable.
    // An instructor seeing next fortnight's classes is plainly right; what they
    // still cannot do is CHANGE any of it, which lives on the manager rung.
    actions: ['chrome.staff', 'home.classes', 'classes.*', 'roster.*', 'schedule.*', 'desk.*'],
    // An instructor sees who is on their mat, so they need the roll too — the
    // same table-level limit as the desk, for the same reason.
    data: ['staff.read', 'memberships.read', 'people.read', 'bookings.read', 'check_ins.read', 'check_ins.write.insert', 'enrolments.read'],
  },

  // ── the manager ──────────────────────────────────────────
  // Runs the timetable and the membership base. The first role that can change
  // what the studio SELLS and what it OFFERS.
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
      'plans.write.insert',
      'plans.write.update',
      // What a block IS — its dates, its size, its price — is a manager's call,
      // for the same reason the price list is.
      'courses.write.insert',
      'courses.write.update',
      // What the automations left behind. A manager who can see the takings can
      // see what the overnight work said about them.
      'notifications.read',
      // The automations themselves are rows a manager authors — which is what
      // makes create, edit and view possible at all.
      'automations.read',
      'automations.write.insert',
      'automations.write.update',
      'subscriptions.write.insert',
      'subscriptions.write.update',
      // Retiring a slot and calling off one dated class are both status
      // changes — which is why there is no delete verb anywhere in this app.
    ],
  },

  // ── the owner ────────────────────────────────────────────
  // Everything the manager has, plus the studio itself: its name, its hours,
  // and — the one that matters for this product — its LOOK. Choosing a theme is
  // an owner's decision and nobody else's.
  owner: {
    extends: ['manager'],
    actions: ['studio.*', 'staff.*'],
    // THE ACL WRITE. Only an owner may change who holds what — and note it is
    // one verb on one table, not a permission system: the charter still decides
    // what a role means, so this screen cannot invent anything.
    data: [
      // THE STORE. Buying an add-on is the owner's decision and nobody else's:
      // a manager runs the timetable, an owner decides what the studio pays for.
      'integrations.read',
      'studio_integrations.read',
      'studio_integrations.write.insert',
      'studio_integrations.write.update',
      'studios.write.update',
      'staff.write.insert',
      'staff.write.update',
      'theme_layouts.read',
    ],
  },

  // ── the automations ──────────────────────────────────────
  //
  // A studio's nightly work, as a principal rather than as a script.
  //
  // It extends NOTHING. That is the whole design: an automation is not a
  // senior member of staff, it is a narrow one, and the temptation to hang it
  // off `owner` — where every verb it might ever want already sits — is the
  // temptation to give unattended code the run of the building. What it holds
  // is exactly what the shipped reflexes replay and nothing else, so a reflex
  // that grows an appetite has to come through this file to get it.
  //
  // `actions` is EMPTY, and that is not an oversight. An automation has no
  // shell, no nav and no screen; ring 1 resolving to nothing is the correct
  // application for something that never logs in. What governs it is ring 3.
  //
  // Tenancy needs no mention here, as usual: `scope()` gives this principal its
  // studio and the behaviors pin every statement to it, so Lumen's nightly job
  // cannot reach a North Rock row — and no line of automation code is what
  // makes that true.
  automation: {
    actions: [],
    data: [
      // Reading what is due.
      'memberships.read',
      'subscriptions.read',
      'people.read',
      'class_sessions.read',
      // The OPERATIONAL bookings, not the member mirror: that one is pinned to
      // `person_id = userId` and would select nothing for a principal that is
      // nobody's member. See tide.entries.ts.
      'bookings.read',
      // The two things it may change. Lapsing a trial is a status write on a
      // membership; everything else it does is leaving a message.
      'memberships.write.update',
      'notifications.write.insert',
      'notifications.read',
    ],
  },

  // ── the integrations, acting for themselves ──────────────
  //
  // What an integration's KEY may do — a webhook landing, a nightly sync,
  // work nobody is driving. Its SCREENS are a different question with a
  // different answer: those arrive under the `ext.*` globs on the human rungs
  // above, granted to the people who look at them.
  //
  // It extends nothing, for the automation's reason: unattended code gets a
  // narrow rung, not a borrowed one. And it is deliberately NOT the automation
  // rung, although today it is smaller — a separate audience is what lets what
  // integrations may write change without touching the nightly work, and what
  // makes "revoke the integration's writes" a different act from "stop the
  // automations".
  //
  // `actions` is empty because a key has no shell. Tenancy needs no mention:
  // the actor's `scope()` names its studio and the behaviors pin every
  // statement to it, so a key acting for North Rock cannot write into Lumen —
  // and no integration code is what makes that true.
  integration: {
    actions: [],
    data: [
      // Leaving a message is the one write any pack may make. Everything else
      // an integration wants is a grant somebody adds here, deliberately, when
      // a pack that needs it exists — the same pressure the automation rung is
      // under, with the same answer.
      'notifications.write.insert',
      'notifications.read',
    ],
  },
};
