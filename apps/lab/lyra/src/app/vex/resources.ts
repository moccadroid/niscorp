export const RESOURCES: Record<string, { entities: readonly string[] }> = {
  studio: { entities: ['studios', 'studio_people', 'check_ins', 'subscriptions', 'passes', 'offerings', 'themes', 'integrations', 'studio_integrations'] },
  member: { entities: ['studio_people', 'people', 'subscriptions', 'subscription_notices', 'subscription_pauses', 'passes', 'offerings', 'connections'] },
  // People the studio only DEALS with. Its own surface because a contact tag is
  // not an entitlement and must never ride along on a read about who attends.
  connections: { entities: ['connections', 'people'] },
  schedule: { entities: ['courses', 'enrolments', 'class_sessions', 'class_templates', 'programs', 'staff', 'bookings', 'studio_people', 'people', 'check_ins'] },
  // Who works here, and what they may do. Its own surface because it is the
  // one place a write changes somebody else's application.
  staff: { entities: ['staff', 'people'] },

  me: { entities: ['studio_people', 'subscriptions', 'subscription_notices', 'subscription_pauses', 'passes', 'offerings', 'bookings', 'enrolments', 'courses', 'class_sessions', 'class_templates', 'programs'] },

  // A resource of its own, so the surface an unattended principal uses is one
  // visible thing and nothing a person browses carries these along by accident.
  automation: { entities: ['studio_people', 'people', 'subscriptions', 'bookings', 'class_sessions', 'notifications', 'outbox', 'campaigns', 'campaign_audiences', 'automations'] },

  // WRITING TO EVERYBODY AT ONCE, and its own surface because the question it
  // asks spans four others: an audience is the roll (studio_people, people)
  // tested against what people hold (subscriptions, bookings) and against what
  // the mail provider has told us (mail_suppressions). Answering that from the
  // People surface would mean widening People with the mail tables, which is
  // how a roll read comes to carry a suppression list.
  //
  // `outbox` is here for the day's ceiling and for nothing else on this
  // surface: the charter gives a manager `outbox.read` and no pen.
  campaigns: {
    entities: ['campaigns', 'campaign_audiences', 'studio_people', 'people', 'subscriptions', 'bookings', 'class_sessions', 'mail_suppressions', 'outbox'],
  },
};
