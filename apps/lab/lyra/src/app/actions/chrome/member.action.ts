import type { ActionDefinition } from '@niscorp/nova';
import { navigatedChannel } from '@niscorp/nova';
import { staffChromeLayout } from './staff.layout';
import { themeCurrentPrism } from './chrome.prism';

// The staff chrome's twin — same reason it is written once there.
const applyContext = [
  { set: 'currentArea', value: '$.context.areaId' },
  { set: 'tabs', value: '$.context.tabs' },
  { set: 'tabCount', value: { $prism: { $length: { $ref: '$.context.tabs' } } } },
  { set: 'moreValue', value: '$.context.moreValue' },
];

export const memberChromeAction: ActionDefinition = {
  id: 'chrome.member',
  title: 'Chrome',
  // `unseen` stays 0 forever here — the member rung cannot read notifications
  // and never asks. It exists because the layout is SHARED with the staff
  // chrome, and a shared layout's refs have to be answerable on both.
  data: { studioName: '', personName: '', roleLabel: '', homeId: '', home: {}, areas: [], primaryAreas: [], currentArea: '', currentLeaf: '', tabs: [], tabCount: 0, moreValue: '', context: {}, menuOpen: false, themeTokens: {}, themeName: '', themeRow: {}, unseen: 0 },
  layout: staffChromeLayout,
  endpoints: {
    leave: { fn: 'auth.leave' },
    theme: { url: '/api/studio/vex', method: 'POST', request: themeCurrentPrism, target: 'themeRow' },
    context: { fn: 'nav.context', target: 'context' },
  },
  lifecycle: { mount: [{ call: 'theme', onSuccess: [{ set: 'themeTokens', value: '$.themeRow.tokens' }, { set: 'themeName', value: '$.themeRow.name' }] }, { set: 'currentLeaf', value: '$.homeId' }, { call: 'context', onSuccess: applyContext }] },
  triggers: [
    // The canvas says where it is; this listens. See the staff chrome for why
    // the clicks stopped saying it.
    { message: navigatedChannel('main'), do: [{ set: 'currentLeaf', value: '@event.payload.action' }, { call: 'context', onSuccess: applyContext }] },
    { event: 'ui:click', ref: 'nav', do: [{ set: 'menuOpen', value: false }, { resetTo: { action: '@event.payload', canvas: 'main' } }] },
    // The member's menu opens the same way the staff one does — the drawer is
    // shared, so the refs have to be.
    { event: 'ui:click', ref: 'navLeaf', do: [{ set: 'menuOpen', value: false }, { resetTo: { action: '@event.payload.value', canvas: 'main' } }] },
    { event: 'ui:click', ref: 'openMenu', do: [{ set: 'menuOpen', value: true }] },
    { event: 'ui:click', ref: 'closeMenu', do: [{ set: 'menuOpen', value: false }] },
    { event: 'ui:click', ref: 'leave', do: [{ call: 'leave' }] },
    // Answerable because the shared layout declares it; unreachable because
    // the strip only renders above zero and a member's count never moves.
    { event: 'ui:click', ref: 'bell', do: [{ set: 'menuOpen', value: false }] },
    { message: 'theme-changed', do: [{ call: 'theme', onSuccess: [{ set: 'themeTokens', value: '$.themeRow.tokens' }, { set: 'themeName', value: '$.themeRow.name' }] }] },
  ],
};
