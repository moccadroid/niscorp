import type { ActionDefinition } from '@niscorp/nova';
// The SAME chrome as staff. There is nothing role-specific about a menu: the
// drawer renders whatever sections the principal holds, and a member holding
// two is the same code path as an owner holding five. Two chrome layouts was
// two places to fix a navigation bug.
import { staffChromeLayout } from './staff.layout';
import { themeCurrentPrism } from './chrome.prism';

// A member's frame. Quieter than the staff bar and deliberately a different
// action rather than a variant of one: a member is not a weaker employee, and
// the two chromes will diverge (a member's carries their next class; a staff
// bar carries the studio).
//
// Which one mounts is a candidate list on the `chrome` canvas — the first id
// the principal actually holds wins, so nothing chooses and nothing branches.
export const memberChromeAction: ActionDefinition = {
  id: 'chrome.member',
  title: 'Chrome',
  data: { studioName: '', personName: '', roleLabel: '', homeId: '', home: {}, areas: [], primaryAreas: [], currentArea: '', currentLeaf: '', tabs: [], tabCount: 0, moreValue: '', context: {}, menuOpen: false, themeTokens: {}, themeName: '', themeRow: {} },
  layout: staffChromeLayout,
  endpoints: {
    leave: { fn: 'auth.leave' },
    theme: { url: '/api/studio/vex', method: 'POST', request: themeCurrentPrism, target: 'themeRow' },
    context: { fn: 'nav.context', target: 'context' },
  },
  lifecycle: { mount: [{ call: 'theme', onSuccess: [{ set: 'themeTokens', value: '$.themeRow.tokens' }, { set: 'themeName', value: '$.themeRow.name' }] }, { set: 'currentLeaf', value: '$.homeId' }, { call: 'context', onSuccess: [{ set: 'currentArea', value: '$.context.areaId' }, { set: 'tabs', value: '$.context.tabs' }, { set: 'tabCount', value: { $prism: { $length: { $ref: '$.context.tabs' } } } }, { set: 'moreValue', value: '$.context.moreValue' }] }] },
  triggers: [
    { event: 'ui:click', ref: 'nav', do: [{ set: 'menuOpen', value: false }, { set: 'currentLeaf', value: '@event.payload' }, { resetTo: { action: '@event.payload', canvas: 'main' } }, { call: 'context', onSuccess: [{ set: 'currentArea', value: '$.context.areaId' }, { set: 'tabs', value: '$.context.tabs' }, { set: 'tabCount', value: { $prism: { $length: { $ref: '$.context.tabs' } } } }, { set: 'moreValue', value: '$.context.moreValue' }] }] },
    // The member's menu opens the same way the staff one does — the drawer is
    // shared, so the refs have to be.
    { event: 'ui:click', ref: 'navLeaf', do: [{ set: 'menuOpen', value: false }, { set: 'currentLeaf', value: '@event.payload.value' }, { resetTo: { action: '@event.payload.value', canvas: 'main' } }, { call: 'context', onSuccess: [{ set: 'currentArea', value: '$.context.areaId' }, { set: 'tabs', value: '$.context.tabs' }, { set: 'tabCount', value: { $prism: { $length: { $ref: '$.context.tabs' } } } }, { set: 'moreValue', value: '$.context.moreValue' }] }] },
    { event: 'ui:click', ref: 'openMenu', do: [{ set: 'menuOpen', value: true }] },
    { event: 'ui:click', ref: 'closeMenu', do: [{ set: 'menuOpen', value: false }] },
    // THE REF THE LAYOUT ACTUALLY USES.
    //
    // This listened for 'signout' — the ref from the member's own bar, which
    // stopped being rendered when both chromes moved to the shared drawer. The
    // drawer's control is 'leave', so a member's Sign out dispatched into
    // nothing and they could not get out of their account. A dangling ref costs
    // nothing at build time and fails silently at the worst moment.
    { event: 'ui:click', ref: 'leave', do: [{ call: 'leave' }] },
    { message: 'theme-changed', do: [{ call: 'theme', onSuccess: [{ set: 'themeTokens', value: '$.themeRow.tokens' }, { set: 'themeName', value: '$.themeRow.name' }] }] },
  ],
};
