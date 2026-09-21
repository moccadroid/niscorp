import type { SeedEntry, SeedMutation } from '@niscorp/vex';

// Pushes to attendees' phones. The ledger is the feature: a festival that sent
// "move to shelter" wants to know afterwards who sent it and to whom.

export const pushesRecent: SeedEntry = {
  fingerprint: 'pushes/recent',
  intent: 'The most recent pushes sent to attendees',
  shape: [{ push_id: '', audience: '', urgency: 0, body: '', created_by: '' }],
  dsl: {
    from: ['pushes'],
    fields: [{ field: 'pushes.id', as: 'push_id' }, 'pushes.audience', 'pushes.urgency', 'pushes.body', 'pushes.created_by'],
    sort: [{ field: 'pushes.created_at', dir: 'desc' }],
    limit: 5,
  },
};

export const pushSend: SeedMutation = {
  fingerprint: 'pushes/send',
  intent: 'Send one push notification to an audience',
  mutation: {
    op: 'insert',
    table: 'pushes',
    values: { audience: { $context: 'audience' }, urgency: { $context: 'urgency' }, body: { $context: 'body' } },
  },
};
