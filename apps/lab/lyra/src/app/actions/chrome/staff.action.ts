import type { ActionDefinition } from '@niscorp/nova';
import { staffChromeLayout } from './staff.layout';
import { themeCurrentPrism } from './chrome.prism';

// The frame every signed-in staff member wears: who they are, which studio they
// are in, and the way out. It also carries the studio's palette — `Theme`
// renders nothing and writes CSS custom properties, and chrome is the right
// host for it because chrome is the one action that is always mounted.
//
// Nothing here branches on a role. A desk clerk and an owner mount the same
// chrome; what differs is which OTHER actions exist in their universe, which is
// ring 1 and not this file's business.
export const staffChromeAction: ActionDefinition = {
  id: 'chrome.staff',
  title: 'Chrome',
  data: {
    studioName: '',
    personName: '',
    roleLabel: '',
    // Which landing surface this principal holds, resolved from ring 1 by the
    // manifest. The nav needs it because resetTo names an action and the action
    // differs per role — deriving it on the server keeps the layout from
    // choosing, which would be a layout branching on capability.
    homeId: '',
    navItems: [],
    // The current section's siblings. Seeded at boot for the landing section
    // and swapped by the tab bar's message — no request, because the tap
    // already carried everything needed.
    // Every destination this principal holds, grouped. The drawer renders it;
    // nothing else in the app knows the navigation exists.
    home: {},
    areas: [],
    // The four the thumb bar shows; the rest live behind More. Derived per
    // principal by the manifest, because which four matter depends on the rung.
    primaryAreas: [],
    // WHERE YOU ARE, in two parts: the AREA (which rail entry and which thumb
    // tab is lit) and the SCREEN inside it (which tab). Both are answered by
    // `nav.context` from the action alone, so neither has to be remembered
    // across a navigation or told by the screen that arrived.
    currentArea: '',
    currentLeaf: '',
    tabs: [],
    // An empty array is truthy, so the guard is a count. Zero means the area
    // has one screen and the row renders nothing.
    tabCount: 0,
    moreValue: '',
    context: {},
    menuOpen: false,
    // The studio's token set, seeded per principal by the manifest's `inputs`.
    // An empty object is the stock palette, which is why a studio with no
    // theme needs no special case anywhere.
    themeTokens: {},
    themeName: '',
    themeRow: {},
  },
  layout: staffChromeLayout,
  endpoints: {
    leave: { fn: 'auth.leave' },
    theme: { url: '/api/studio/vex', method: 'POST', request: themeCurrentPrism, target: 'themeRow' },
    // WHERE AM I, AND WHAT IS BESIDE ME — asked on every move. See
    // `nav.context` in server/functions/nav.ts for why this is a call rather
    // than something the screen announces or `inputs` seeds.
    context: { fn: 'nav.context', target: 'context' },
  },
  // Re-read the look when it changes. Boot input alone would mean a studio
  // that re-skinned itself kept the old palette until somebody reloaded — and
  // "no reload" is the entire claim.
  lifecycle: {
    mount: [
      { call: 'theme', onSuccess: [{ set: 'themeTokens', value: '$.themeRow.tokens' }, { set: 'themeName', value: '$.themeRow.name' }] },
      // The boot mount lands on a landing screen, so the chrome asks where
      // that is exactly as it will on every move after — one path, so the tab
      // row cannot be right on navigation and wrong on arrival.
      { set: 'currentLeaf', value: '$.homeId' },
      { call: 'context', onSuccess: [{ set: 'currentArea', value: '$.context.areaId' }, { set: 'tabs', value: '$.context.tabs' }, { set: 'tabCount', value: { $prism: { $length: { $ref: '$.context.tabs' } } } }, { set: 'moreValue', value: '$.context.moreValue' }] },
    ],
  },
  // `resetTo` rather than `push`: the bar is navigation, and navigation
  // replaces where you are instead of burying it under a stack nobody can see
  // the bottom of. Back inside a section still works, because a record pushes
  // onto whatever the nav reset to.
  triggers: [
    // ONE trigger for the whole bar: the item carries its target as the click
    // payload, and resetTo resolves it. Adding a destination is adding a row in
    // the manifest, not a button and a trigger that must be kept in step.
    // Navigating CLOSES the menu. A drawer left open over the screen you asked
    // for is the commonest way this pattern is got wrong.
    // AN AREA: light it, open it, and clear whichever screen inside it was
    // lit before.
    // AN AREA carries its LANDING action as the payload — there is no hub
    // screen to arrive at, so tapping People opens the roll and the roll's
    // siblings become the tab row. One trigger serves the rail and the thumb
    // bar, because both send the same thing.
    {
      event: 'ui:click',
      ref: 'nav',
      do: [
        { set: 'menuOpen', value: false },
        { set: 'currentLeaf', value: '@event.payload' },
        { resetTo: { action: '@event.payload', canvas: 'main' } },
        { call: 'context', onSuccess: [{ set: 'currentArea', value: '$.context.areaId' }, { set: 'tabs', value: '$.context.tabs' }, { set: 'tabCount', value: { $prism: { $length: { $ref: '$.context.tabs' } } } }, { set: 'moreValue', value: '$.context.moreValue' }] },
      ],
    },
    // A SCREEN INSIDE ONE, from the tab row. The area cannot change, so the
    // context call only refreshes what is lit — and it is the same call, so
    // there is one answer to "where am I" rather than two that can disagree.
    {
      event: 'ui:click',
      ref: 'navLeaf',
      do: [
        { set: 'menuOpen', value: false },
        { set: 'currentLeaf', value: '@event.payload.value' },
        { resetTo: { action: '@event.payload.value', canvas: 'main' } },
        { call: 'context', onSuccess: [{ set: 'currentArea', value: '$.context.areaId' }, { set: 'tabs', value: '$.context.tabs' }, { set: 'tabCount', value: { $prism: { $length: { $ref: '$.context.tabs' } } } }, { set: 'moreValue', value: '$.context.moreValue' }] },
      ],
    },
    { event: 'ui:click', ref: 'openMenu', do: [{ set: 'menuOpen', value: true }] },
    // The scrim fires this too, so tapping beside the drawer closes it.
    { event: 'ui:click', ref: 'closeMenu', do: [{ set: 'menuOpen', value: false }] },
    { event: 'ui:click', ref: 'leave', do: [{ call: 'leave' }] },
    // The look changed. Nothing here knows what changed or why — it re-reads.
    { message: 'theme-changed', do: [{ call: 'theme', onSuccess: [{ set: 'themeTokens', value: '$.themeRow.tokens' }, { set: 'themeName', value: '$.themeRow.name' }] }] },
  ],
};
