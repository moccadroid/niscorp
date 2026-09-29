import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { notificationLayout } from './notification.layout';

// A NOTIFICATION on the controller: what a saved automation's `notify` effect
// said (server/timing.ts). The effect publishes `notify` into the speaker's
// live shell with its words; the head, always on the controller, opens this
// over the screen with them. Nothing is stored: tide's own ledger is the
// record of what ran and whether anybody was there to see it.
export const notificationAction: ActionDefinition = {
  id: 'speaker.notification',
  description: 'A message from one of the speaker\'s saved automations, shown over the controller until they close it.',
  title: 'Notification',
  data: { text: '', sheetTitle: 'Notification' },
  input: z.toJSONSchema(
    z.object({
      text: z.string().optional().describe('The words of the notification.'),
      sheetTitle: z.string().optional().describe('The title over it.'),
    }),
  ),
  layout: notificationLayout,
  triggers: [],
};
