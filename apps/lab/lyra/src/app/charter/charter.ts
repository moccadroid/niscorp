import type { Charter } from '@niscorp/charter';

export const CHARTER: Charter = {
  public: { actions: ['auth.login'], functions: ['auth.enter', 'auth.request'] },

  base: {
    actions: ['confirm'],
    // `integrations.read` is here because approved integrations ship
    // phrasebooks, and every shell needs its book.
    data: ['studios.read', 'themes.read', 'phrases.read', 'integrations.read', 'programs.read', 'class_sessions.read', 'class_templates.read', 'courses.read'],
  },

  // Worn by nobody: moss runs the identity entries under it before a person
  // has a policy, each pinned to the caller's own row by the `identity` reach.
  identity: {
    data: ['people.read', 'studios.read', 'studio_integrations.read', 'guardianships.read'],
    scoping: 'identity',
  },

  // `credential`, `mailer`, `transport` and `scheduler` are worn by nobody
  // either: each is executed only through `server.executeAs`.
  credential: {
    data: ['people.read', 'login_links.write.insert', 'login_links.write.delete'],
  },
  mailer: {
    data: ['outbox.read', 'outbox.write.update', 'mail_suppressions.write.insert', 'mail_suppressions.write.update', 'studio_people.write.update'],
    scoping: 'mailer',
  },
  // The dev-login roster, read before anybody has signed in. Its one caller
  // answers only when `LYRA_DEV_LOGIN` is on.
  transport: {
    data: ['people.read', 'staff.read', 'studio_people.read', 'studios.read'],
    scoping: 'transport',
  },
  scheduler: {
    data: ['automations.read', 'studios.read'],
    scoping: 'scheduler',
  },

  // A sibling of the staff roles, not their base: a grant added here never
  // lands on the desk as a studio-wide read.
  member: {
    functions: ['auth.leave', 'nav.context', 'nav.family', 'nav.identity'],
    extends: ['base'],
    scoping: 'personal',
    actions: ['chrome.member', 'home.member', 'me.*', 'confirm', 'ext.member.*'],
    data: [
      'studio_people.read',
      'subscriptions.read',
      // Served at the personal reach, which stamps `person_id` from the caller:
      // a member starts only their own plan.
      'subscriptions.write.insert',
      'subscription_notices.write.insert',
      'subscription_pauses.write.insert',
      'subscription_pauses.write.update',
      'passes.read',
      'offerings.read',
      'bookings.read',
      'bookings.write.insert',
      'bookings.write.update',
      'courses.read',
      'enrolments.read',
      'enrolments.write.insert',
      'enrolments.write.update',
      'guardianships.read',
      // No `people.read`: with it a member could replay `people/list`. A child's
      // name arrives on the identity record, read by the `identity` role.
    ],
  },

  desk: {
    functions: ['auth.leave', 'nav.attachments', 'nav.context', 'nav.identity'],
    extends: ['base'],
    actions: ['chrome.staff', 'home.desk', 'people.*', 'desk.*', 'schedule.*', 'ext.desk.*'],
    data: [
      'staff.read',
      'studio_people.read',
      'people.read',
      'offerings.read',
      'notifications.read',
      'notifications.write.update',
      // No `subscriptions.read`: with `offerings.read` it is the revenue query,
      // and a fingerprint is replayable by anyone whose policy covers its tables.
      'bookings.read',
      'check_ins.read',
      'studio_people.write.insert',
      'studio_people.write.update',
      'passes.read',
      'passes.write.insert',
      'people.write.insert',
      'people.write.update',
      'connections.read',
      'connections.write.insert',
      'connections.write.update',
      'guardianships.read',
      'guardianships.write.insert',
      'check_ins.write.insert',
      'bookings.write.insert',
      'bookings.write.update',
      'enrolments.read',
      'enrolments.write.insert',
      'enrolments.write.update',
    ],
  },

  instructor: {
    functions: ['auth.leave', 'nav.context', 'nav.identity'],
    extends: ['base'],
    actions: ['chrome.staff', 'home.classes', 'classes.*', 'roster.*', 'schedule.*', 'desk.*'],
    data: ['staff.read', 'studio_people.read', 'people.read', 'bookings.read', 'check_ins.read', 'check_ins.write.insert', 'enrolments.read'],
  },

  manager: {
    functions: ['automations.audience', 'automations.preview', 'automations.run', 'automations.sendAgain', 'nav.identity', 'reports.window'],
    extends: ['instructor', 'desk'],
    actions: ['home.overview', 'plans.*', 'programs.*', 'courses.*', 'timetable.*', 'reports.*', 'automations.*', 'campaigns.*', 'hub.marketing', 'studio.addons'],
    data: [
      'subscriptions.read',
      'class_templates.write.insert',
      'class_templates.write.update',
      'class_sessions.write.insert',
      'class_sessions.write.update',
      'programs.write.insert',
      'programs.write.update',
      'offerings.write.insert',
      'offerings.write.update',
      // The database refuses the delete for any offering anything has ever held
      // (`offerings.held_count`): this undoes a mistake, never removes a product.
      'offerings.write.delete',
      'courses.write.insert',
      'courses.write.update',
      'notifications.read',
      'notifications.write.update',
      'outbox.read',
      'automations.read',
      'automations.write.insert',
      'automations.write.update',
      'automation_moments.read',
      'automation_effects.read',
      'automation_recipes.read',
      'tide_run.read',
      'subscriptions.write.insert',
      'subscriptions.write.update',
      'subscription_notices.read',
      'subscription_notices.write.insert',
      'subscription_notices.write.update',
      'subscription_pauses.read',
      'subscription_pauses.write.insert',
      'subscription_pauses.write.update',
      'purchases.read',
      'purchases.write.insert',
      // No write on `outbox`: the machinery that reads a campaign row writes the
      // mail, so consent is checked at the moment of writing.
      'campaign_audiences.read',
      'campaigns.read',
      'campaigns.write.insert',
      // The grant does not hand anybody the list: reads are replay-only, and the
      // one entry on this rung correlates on the person's own address and on
      // this studio's id or the empty one.
      'mail_suppressions.read',
    ],
  },

  owner: {
    functions: ['mail.addDomain', 'mail.checkDomain', 'mail.sender', 'world.languages', 'world.refresh', 'world.relanguage'],
    extends: ['manager'],
    actions: ['studio.*', 'staff.*'],
    data: [
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

  automation: {
    actions: [],
    data: [
      'studio_people.read',
      'subscriptions.read',
      'people.read',
      'class_sessions.read',
      'bookings.read',
      // The mail's envelope carries the studio's own name and reply address:
      // without this read every send is refused.
      'studios.read',
      'mail_suppressions.read',
      'outbox.write.insert',
      'outbox.read',
      // A row is claimed ('queued' → 'sending') before the send, or a retry
      // mails somebody twice. Safe only while no person writes `outbox`: a grant
      // is table.verb and cannot tell two updates apart.
      'outbox.write.update',
      'notifications.write.insert',
      // No insert: composing a campaign is a person's act, and machinery that
      // could author one could decide by itself to write to everybody.
      'campaigns.read',
      'campaigns.write.update',
      'campaign_audiences.read',
    ],
  },

  integration: {
    actions: [],
    data: [
      'notifications.write.insert',
      'notifications.read',
    ],
  },

  // A rung of its own: every other integration shares `integration`, and
  // payment grants there would let any of them move somebody's standing.
  // No `subscription_notices.*`: notice is its own table to be its own grant.
  stripe: {
    actions: [],
    data: [
      'subscriptions.read',
      'subscriptions.write.update',
      'offerings.read',
      'studio_people.read',
      'people.read',
      'notifications.write.insert',
      'outbox.write.insert',

      // Inserted only once somebody has paid: before the money it would be a
      // usable pass nobody paid for. `passes` is unique on (studio, purchase_ref)
      // and `enrolments` on (course, person), so a redelivery lands on its row.
      'courses.read',
      'passes.write.insert',
      'enrolments.write.insert',
      'purchases.write.insert',
    ],
  },
};
