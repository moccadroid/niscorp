import type { ActionFragment } from '@niscorp/nova';

// THE SHEET FRAGMENT — the rule, made structural.
//
// The rule is: anything that CREATES or EDITS opens over what you were looking
// at, never in place. A form is not a place you go; it is something you do to
// the thing on screen, and replacing the list you were reading to type a name
// into it is the commonest way an app loses somebody's place.
//
// Before this, the rule was a habit. Five screens grew inline forms that
// appeared on the page (`if: '$.editing'`), five actions were pushed to the
// sheet canvas, and each of the pushed ones needed its own `sheetClose` trigger
// — which is how `desk.checkin` ended up in a sheet with no way out.
//
// A FRAGMENT makes the rule a thing rather than a convention:
//
//   • its layout WRAPS the action's, filling `{ slot: 'body' }`, so the header
//     and the escape are supplied by the fragment and not by each form
//   • its triggers CONCAT ahead of the action's, so `sheetClose` exists on
//     anything composed with it — no action can be pushed here and be stuck
//   • the action still wins every conflict, so nothing it defines is at risk
//
// Used as: `push: { action, canvas: 'sheet', with: ['sheet'] }`. That phrase is
// now the whole rule, and `shell-check` asserts every sheet push carries it.
export const sheetFragment: ActionFragment = {
  kind: 'fragment',
  id: 'sheet',
  layout: {
    component: 'Stack',
    props: { gap: 0 },
    children: [
      // The action's own layout goes here. `title` comes from the action's
      // data when it has one, and an absent title renders nothing rather than
      // an empty bar — a form that already leads with a heading does not need
      // a second one.
      { slot: 'body' },
    ],
  },
  triggers: [
    // THE ESCAPE, supplied once. The `Sheet` component's close control and its
    // scrim both dispatch this, so composing with the fragment is what makes
    // an action safe to open here at all.
    { event: 'ui:click', ref: 'sheetClose', do: [{ pop: true }] },
  ],
};
