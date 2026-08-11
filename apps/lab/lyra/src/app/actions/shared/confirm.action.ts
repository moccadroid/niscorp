import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

// ASK BEFORE YOU DO IT — one action, every confirmation in the app.
//
// This is the nova shape for it, and relay had the precedent: push a small
// action over what you were looking at, let it ASK, and have it ANNOUNCE the
// answer rather than perform it. The opener stashed what the change is about
// before pushing, and listens for the message to do the work.
//
// The decoupling is the point. This action knows a sentence and a channel; it
// does not know what it is confirming, cannot perform it, and needs no grant to
// anything it is protecting. Which means one action serves a role change, a
// cancellation, a deletion and whatever comes next.
//
// It is GENERIC where relay's is per-kind: `emit.channel` resolves a binding
// (see nova's step runtime), so the CALLER names the channel and the same
// action serves every case instead of one `confirm-<thing>` per thing.
//
//   push: { action: 'confirm', canvas: 'sheet', with: ['sheet'],
//           input: { title, message, confirmLabel, channel: 'role-confirmed' } }
//   ...
//   { message: 'role-confirmed', do: [ …the actual write… ] }
//
// What this replaces: an inline "Change their role? [Change it] [Cancel]" strip
// rendered into a list row by a bespoke component. It worked, and it was a
// second confirmation mechanism sitting beside the sheet — which is exactly the
// duplication the sheet fragment was built to stop.
// No inset and no measure — the sheet insets its own body, the same way the
// surface insets the screens. A confirmation is a column of content; where it
// sits is the host's business.
const confirmLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 18 },
  children: [
    // NO HEADING HERE. The sheet's own header renders `title`, so a heading in
    // the body prints the question twice — which is what it did.
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
