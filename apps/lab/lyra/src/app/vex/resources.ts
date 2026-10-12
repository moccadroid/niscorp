export const RESOURCES: Record<string, { entities: readonly string[] }> = {
  studio: { entities: ['studios', 'studio_people', 'check_ins', 'subscriptions', 'passes', 'offerings', 'themes', 'integrations', 'studio_integrations'] },
  member: { entities: ['studio_people', 'people', 'subscriptions', 'subscription_notices', 'subscription_pauses', 'passes', 'offerings', 'connections'] },
  connections: { entities: ['connections', 'people'] },
  schedule: { entities: ['courses', 'enrolments', 'class_sessions', 'class_templates', 'programs', 'staff', 'bookings', 'studio_people', 'people', 'check_ins'] },
  staff: { entities: ['staff', 'people'] },

  me: { entities: ['studio_people', 'subscriptions', 'subscription_notices', 'subscription_pauses', 'passes', 'offerings', 'bookings', 'enrolments', 'courses', 'class_sessions', 'class_templates', 'programs'] },

  automation: { entities: ['studio_people', 'people', 'subscriptions', 'bookings', 'class_sessions', 'notifications', 'outbox', 'campaigns', 'campaign_audiences', 'automations'] },

  campaigns: {
    entities: ['campaigns', 'campaign_audiences', 'studio_people', 'people', 'subscriptions', 'bookings', 'class_sessions', 'mail_suppressions', 'outbox'],
  },
};
