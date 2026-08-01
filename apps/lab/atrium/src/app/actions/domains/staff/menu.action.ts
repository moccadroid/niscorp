import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

// ═══════════════════════════════════════════════════════════
// THE STAFF MENU — what you can reach, from the rows that decided it.
//
// The crew screen used to BE the composition: every surface seeded onto the
// working column as a collapsed card, expanding in place. That is what made
// every action carry two faces and a root branch, and it is what this replaces.
//
// The menu is still not authored. `entries` is loaded from the same resolved
// surface everything else reads, so it lists exactly what this property's
// connectors offer, this role holds, and this stay state permits — a go-live
// grows the menu with no edit here. What changed is that opening one PUSHES it
// onto `work` as its own surface, instead of unfolding it in place.
//
// `work` is a stack, so one thing is open at a time and Back is real.
// ═══════════════════════════════════════════════════════════

// A STRIP, not a card. This was a bare untitled `Card` full of `MenuItem` rows —
// and MenuItem is a row inside a dropdown, so it read as a context menu that had
// got stuck open in the middle of an empty page. It is navigation: one line of
// nav rows, wrapping, no box around it, no vertical space claimed.
const menuLayout: LayoutNode = {
  component: 'Row',
  props: { gap: 4, wrap: true, align: 'center' },
  children: [
    {
      for: '$.entries',
      as: 'e',
      key: 'action_id',
      // `active` marks where you ARE. Without it the bar was five identical
      // links over a screen that had one of them open, which is a nav bar that
      // refuses to say anything about the application.
      do: {
        component: 'NavItem',
        ref: 'open',
        props: { label: '$e.title', icon: '$e.icon', value: '$e', active: { $eq: ['$e.action_id', '$.openId'] } },
      },
    },
  ],
};

export const staffMenuAction: ActionDefinition = {
  id: 'staff.menu',
  title: 'Everything here',
  data: { propertyId: '', staffId: '', audience: '', entries: [], openId: '' },
  layout: menuLayout,
  endpoints: {
    load: {
      url: '/api/surface/vex',
      method: 'POST',
      request: { fingerprint: 'surface/menu', context: { propertyId: { $ref: '$.propertyId' }, audience: { $ref: '$.audience' } } },
      target: 'entries',
    },
  },
  // THE MENU OWNS WHAT IS OPEN. The work canvas used to carry an `initial`
  // candidate list, which meant the landing surface was decided in the manifest
  // and the bar had no idea which of its links that was — so nothing could be
  // marked active without authoring the same list twice. Opening the first
  // resolved entry here makes one source of truth: the rows.
  lifecycle: {
    mount: [
      {
        call: 'load',
        onSuccess: [
          { set: 'openId', from: 'entries.0.action_id' },
          { resetTo: { action: '{{$.entries.0.action_id}}', canvas: 'work', input: { propertyId: '$.propertyId', staffId: '$.staffId' } } },
        ],
      },
    ],
  },
  triggers: [
    // The row carries the resolved slot, so the target is the id the DATABASE
    // decided — the same guarantee the guest concierge has. Nothing here can
    // open an action that did not come out of the resolver.
    //
    // A TOP-LEVEL NAV ITEM IS A RESET. `resetTo` clears the list column rather
    // than stacking a second queue behind the first, and `work-reset` tells
    // whatever record is open beside it to close — switching to Messages while
    // an issue is open should not leave that issue sitting there.
    {
      event: 'ui:click',
      ref: 'open',
      do: [
        { set: 'openId', value: '@event.payload.action_id' },
        { emit: { channel: 'work-reset' } },
        { resetTo: { action: '{{@event.payload.action_id}}', canvas: 'work', input: { propertyId: '$.propertyId', staffId: '$.staffId' } } },
      ],
    },
    // A go-live reaches an open menu.
    { message: 'surface-changed', do: [{ call: 'load' }] },
  ],
};

export const staffMenuInputSchema = z.toJSONSchema(
  z.object({
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    staffId: z.string().optional().describe('Seeded by the chrome from the session; handed to whatever the menu opens, because a staff surface asks whose work it is.'),
    audience: z.string().optional().describe('Seeded from the session; decides which slice of the resolved surface is listed.'),
  }),
);
