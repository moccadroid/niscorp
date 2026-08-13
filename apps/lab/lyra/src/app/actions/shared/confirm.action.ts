import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

const confirmLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 18 },
  children: [
    // No heading: the sheet's own header renders `title`, so one here prints the
    // question twice.
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
  // The sheet labels itself from this, so a confirmation carries its own
  // heading without the caller passing one twice.
  title: '$.title',
  data: {
    title: 'Are you sure?',
    message: 'This cannot be undone.',
    confirmLabel: 'Yes, do it',
    // `solid` for ordinary changes, `danger` for the ones that destroy
    // something. The caller decides, because the caller knows.
    tone: 'solid',
    // What to shout when the answer is yes. The opener listens for it.
    channel: 'confirmed',
  },
  layout: confirmLayout,
  triggers: [
    { event: 'ui:click', ref: 'cancel', do: [{ pop: true }] },
    // Announce, then close. Nothing here performs the change — the opener's
    // handler does, which is why this action needs no grant to it.
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
