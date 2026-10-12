import type { ActionDefinition } from '@niscorp/nova';
import { z } from 'zod';
import { notificationLayout } from './notification.layout';

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
