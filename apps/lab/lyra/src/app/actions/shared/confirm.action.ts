import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

const confirmLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 18 },
  children: [
    { component: 'Text', props: { size: 'md', color: 'soft' }, children: '$.message' },
    {
      component: 'Row',
      props: { gap: 10, wrap: true },
      children: [
        { component: 'Button', props: { variant: '$.tone', big: true, label: '$.confirmLabel' }, ref: 'confirm' },
        { component: 'Button', props: { variant: 'ghost', big: true, label: 'Cancel' }, ref: 'cancel' },
      ],
    },
  ],
};

export const confirmAction: ActionDefinition = {
  id: 'confirm',
  title: '$.title',
  data: {
    title: 'Are you sure?',
    message: 'This cannot be undone.',
    confirmLabel: 'Yes, do it',
    tone: 'solid',
    channel: 'confirmed',
  },
  layout: confirmLayout,
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'confirm', do: [{ emit: { channel: '$.channel' } }, { pop: true }] },
  ],
};

export const confirmInputSchema = z.toJSONSchema(
  z.object({
    title: z.string().optional(),
    message: z.string().optional(),
    confirmLabel: z.string().optional(),
    tone: z.enum(['solid', 'danger']).optional(),
    channel: z.string().describe('The message emitted when somebody says yes. The opener listens for it and does the work.'),
  }),
);
