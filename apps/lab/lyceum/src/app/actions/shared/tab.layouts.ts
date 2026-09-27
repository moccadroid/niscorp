import { z } from 'zod';
import type { LayoutNode } from '@niscorp/nova';

// A TAB ON THE PHONE. The phone (member/phone.action.ts) has a bar of one tab
// per thing its person HAS — composed, not authored: the bar lists every
// candidate and nova's `reconcile` places only the actions this shell holds.
// So each of those actions renders itself small when it is loaded with
// `{ tab: true }` — this button, named by its own `tabLabel` — and, pressed,
// resets the phone's body to its full self:
//
//   layout:   { if: '$.tab', then: TAB_BUTTON, else: <the full layout> }
//   triggers: { event: 'ui:click', ref: 'open', do: [{ resetTo: { action: <its id>, canvas: 'body' } }] }
//   input:    TAB_INPUT
//
// Nothing here knows who anybody is.

export const TAB_BUTTON: LayoutNode = { component: 'Action', ref: 'open', props: { ink: 'paper', label: '{{$.tabLabel}}' } };

// The openable input every tab-able action declares (rule 14).
export const TAB_INPUT = z.toJSONSchema(
  z.object({
    tab: z.boolean().optional().describe('Render as a tab on the phone: a button with the action\'s name that opens it in the phone\'s body.'),
  }),
);
