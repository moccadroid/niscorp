import type { ActionDefinition } from '@niscorp/nova';
import { navigatedChannel } from '@niscorp/nova';
import { staffChromeLayout } from './staff.layout';
import { themeCurrentPrism } from './chrome.prism';

const applyContext = [
  { set: 'currentArea', value: '$.context.areaId' },
  { set: 'tabs', value: '$.context.tabs' },
  { set: 'tabCount', value: { $prism: { $length: { $ref: '$.context.tabs' } } } },
  { set: 'moreValue', value: '$.context.moreValue' },
];

export const memberChromeAction: ActionDefinition = {
  id: 'chrome.member',
  title: 'Chrome',
  data: { studioName: '', personName: '', roleLabel: '', homeId: '', home: {}, areas: [], primaryAreas: [], currentArea: '', currentLeaf: '', tabs: [], tabCount: 0, moreValue: '', context: {}, menuOpen: false, themeTokens: {}, themeName: '', themeRow: {}, unseen: 0 },
  layout: staffChromeLayout,
  endpoints: {
    leave: { fn: 'auth.leave' },
    theme: { url: '/api/studio/vex', method: 'POST', request: themeCurrentPrism, target: 'themeRow' },
    context: { fn: 'nav.context', target: 'context' },
  },
  lifecycle: { mount: [{ call: 'theme', onSuccess: [{ set: 'themeTokens', value: '$.themeRow.tokens' }, { set: 'themeName', value: '$.themeRow.name' }] }, { set: 'currentLeaf', value: '$.homeId' }, { call: 'context', onSuccess: applyContext }] },
  triggers: [
    { message: navigatedChannel('main'), do: [{ set: 'currentLeaf', value: '@event.payload.action' }, { call: 'context', onSuccess: applyContext }] },
    { event: 'ui:click', ref: 'nav', do: [{ set: 'menuOpen', value: false }, { resetTo: { action: '@event.payload', canvas: 'main' } }] },
    { event: 'ui:click', ref: 'navLeaf', do: [{ set: 'menuOpen', value: false }, { resetTo: { action: '@event.payload.value', canvas: 'main' } }] },
    { event: 'ui:click', ref: 'openMenu', do: [{ set: 'menuOpen', value: true }] },
    { event: 'ui:click', ref: 'closeMenu', do: [{ set: 'menuOpen', value: false }] },
    { event: 'ui:click', ref: 'leave', do: [{ call: 'leave' }] },
    // Unreachable: the shared layout declares `bell`, but its strip renders only
    // above zero and a member's count never moves.
    { event: 'ui:click', ref: 'bell', do: [{ set: 'menuOpen', value: false }] },
    { message: 'theme-changed', do: [{ call: 'theme', onSuccess: [{ set: 'themeTokens', value: '$.themeRow.tokens' }, { set: 'themeName', value: '$.themeRow.name' }] }] },
  ],
};
