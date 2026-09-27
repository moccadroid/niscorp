import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

// A TAB ON THE PHONE. The phone (member/phone.action.ts) has a bar of one tab
// per thing its person HAS — composed, not authored: the bar lists every
// candidate and nova's `reconcile` places only the actions this shell holds.
// So each of those actions renders itself small when it is loaded with
// `{ tab: true }` — this button, named by its own `tabLabel` — and, pressed,
// resets the phone's body to its full self:
//
//   data:     tab: false, tabLabel: '…', tabInk: 'paper', nextInk: 'paper'
//   layout:   { if: '$.tab', then: TAB_BUTTON, else: <the full layout> }
//   triggers: { event: 'ui:click', ref: 'open', do: [
//               { set: 'nextInk', value: 'ink' }, { emit: { channel: 'tab-opened' } },
//               { resetTo: { action: <its id>, canvas: 'body' } } ] },
//             TAB_OPENED
//   input:    TAB_INPUT
//
// THE OPEN TAB IS INK. Each tab is its own instance and cannot see the body,
// so the tabs agree among themselves: the pressed one sets its `nextInk` to
// ink and announces `tab-opened` (no payload — which tab is its own data);
// every tab, hearing it, takes its `nextInk` as its ink and resets it. The
// announcement lands after the turn, so the order cannot undo the mark.
// Nothing here knows who anybody is.

export const TAB_BUTTON: LayoutNode = { component: 'Action', ref: 'open', props: { ink: '$.tabInk', label: '{{$.tabLabel}}' } };

export const TAB_OPENED: NonNullable<ActionDefinition['triggers']>[number] = {
  message: 'tab-opened',
  do: [
    { set: 'tabInk', value: '$.nextInk' },
    { set: 'nextInk', value: 'paper' },
  ],
};

// The openable input every tab-able action declares (rule 14).
export const TAB_INPUT = z.toJSONSchema(
  z.object({
    tab: z.boolean().optional().describe('Render as a tab on the phone: a button with the action\'s name that opens it in the phone\'s body.'),
    tabInk: z.enum(['paper', 'ink']).optional().describe('The tab\'s ink: `ink` marks the tab whose action is open in the body.'),
  }),
);
