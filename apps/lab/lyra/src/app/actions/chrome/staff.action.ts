import type { ActionDefinition } from '@niscorp/nova';
import { staffChromeLayout } from './staff.layout';
import { themeCurrentPrism, unseenPrism } from './chrome.prism';

export const staffChromeAction: ActionDefinition = {
  id: 'chrome.staff',
  title: 'Chrome',
  data: {
    studioName: '',
    personName: '',
    roleLabel: '',
    homeId: '',
    navItems: [],
    home: {},
    areas: [],
    // The four the thumb bar shows; the rest live behind More. Derived per
    // principal by the manifest, because which four matter depends on the rung.
    primaryAreas: [],
    currentArea: '',
    currentLeaf: '',
    tabs: [],
    // An empty array is truthy, so the guard is a count. Zero means the area
    // has one screen and the row renders nothing.
    tabCount: 0,
    moreValue: '',
    context: {},
    menuOpen: false,
    themeTokens: {},
    themeName: '',
    themeRow: {},
    // The bell: how many notifications the studio has not read. Counted on
    // mount, re-counted when the socket says 'notified' — push over the shell
    // the chrome already lives in, no polling anywhere.
    unseenRow: {},
    unseen: 0,
  },
  layout: staffChromeLayout,
  endpoints: {
    leave: { fn: 'auth.leave' },
    theme: { url: '/api/studio/vex', method: 'POST', request: themeCurrentPrism, target: 'themeRow' },
    unseen: { url: '/api/automation/vex', method: 'POST', request: unseenPrism, target: 'unseenRow' },
    // Asked on every move. See `nav.context` in server/functions/nav.ts for why
    // this is a call rather than something the screen announces.
    context: { fn: 'nav.context', target: 'context' },
  },
  // Boot input alone would leave a studio that re-skinned itself wearing the old
  // palette until somebody reloaded, and "no reload" is the entire claim.
  lifecycle: {
    mount: [
      { call: 'theme', onSuccess: [{ set: 'themeTokens', value: '$.themeRow.tokens' }, { set: 'themeName', value: '$.themeRow.name' }] },
      { set: 'currentLeaf', value: '$.homeId' },
      { call: 'unseen', onSuccess: [{ set: 'unseen', value: '$.unseenRow.total' }] },
      { call: 'context', onSuccess: [{ set: 'currentArea', value: '$.context.areaId' }, { set: 'tabs', value: '$.context.tabs' }, { set: 'tabCount', value: { $prism: { $length: { $ref: '$.context.tabs' } } } }, { set: 'moreValue', value: '$.context.moreValue' }] },
    ],
  },
  triggers: [
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
    // The studio was TOLD something — the socket fan-out from a landed
    // `automation/notify` (app.ts onMutation). Re-count rather than increment:
    // the row is the fact, and a push that raced another reader still ends at
    // the right number. The bell click is the pull half.
    { message: 'notified', do: [{ call: 'unseen', onSuccess: [{ set: 'unseen', value: '$.unseenRow.total' }] }] },
    { message: 'notices-seen', do: [{ call: 'unseen', onSuccess: [{ set: 'unseen', value: '$.unseenRow.total' }] }] },
    { event: 'ui:click', ref: 'bell', do: [{ set: 'menuOpen', value: false }, { set: 'currentLeaf', value: 'desk.followups' }, { resetTo: { action: 'desk.followups', canvas: 'main' } }, { call: 'context', onSuccess: [{ set: 'currentArea', value: '$.context.areaId' }, { set: 'tabs', value: '$.context.tabs' }, { set: 'tabCount', value: { $prism: { $length: { $ref: '$.context.tabs' } } } }, { set: 'moreValue', value: '$.context.moreValue' }] }] },
  ],
};
