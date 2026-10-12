import type { ActionDefinition } from '@niscorp/nova';
import { navigatedChannel } from '@niscorp/nova';
import { staffChromeLayout } from './staff.layout';
import { themeCurrentPrism, unseenPrism } from './chrome.prism';

const applyContext = [
  { set: 'currentArea', value: '$.context.areaId' },
  { set: 'tabs', value: '$.context.tabs' },
  { set: 'tabCount', value: { $prism: { $length: { $ref: '$.context.tabs' } } } },
  { set: 'moreValue', value: '$.context.moreValue' },
];

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
    primaryAreas: [],
    currentArea: '',
    currentLeaf: '',
    tabs: [],
    // An empty array is truthy, so the layout's guard is a count.
    tabCount: 0,
    moreValue: '',
    context: {},
    menuOpen: false,
    themeTokens: {},
    themeName: '',
    themeRow: {},
    unseenRow: {},
    unseen: 0,
  },
  layout: staffChromeLayout,
  endpoints: {
    leave: { fn: 'auth.leave' },
    theme: { url: '/api/studio/vex', method: 'POST', request: themeCurrentPrism, target: 'themeRow' },
    unseen: { url: '/api/automation/vex', method: 'POST', request: unseenPrism, target: 'unseenRow' },
    context: { fn: 'nav.context', target: 'context' },
  },
  lifecycle: {
    mount: [
      { call: 'theme', onSuccess: [{ set: 'themeTokens', value: '$.themeRow.tokens' }, { set: 'themeName', value: '$.themeRow.name' }] },
      { set: 'currentLeaf', value: '$.homeId' },
      { call: 'unseen', onSuccess: [{ set: 'unseen', value: '$.unseenRow.total' }] },
      { call: 'context', onSuccess: applyContext },
    ],
  },
  triggers: [
    {
      message: navigatedChannel('main'),
      do: [{ set: 'currentLeaf', value: '@event.payload.action' }, { call: 'context', onSuccess: applyContext }],
    },
    {
      event: 'ui:click',
      ref: 'nav',
      do: [
        { set: 'menuOpen', value: false },
        { resetTo: { action: '@event.payload', canvas: 'main' } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'navLeaf',
      do: [
        { set: 'menuOpen', value: false },
        { resetTo: { action: '@event.payload.value', canvas: 'main' } },
      ],
    },
    { event: 'ui:click', ref: 'openMenu', do: [{ set: 'menuOpen', value: true }] },
    { event: 'ui:click', ref: 'closeMenu', do: [{ set: 'menuOpen', value: false }] },
    { event: 'ui:click', ref: 'leave', do: [{ call: 'leave' }] },
    { message: 'theme-changed', do: [{ call: 'theme', onSuccess: [{ set: 'themeTokens', value: '$.themeRow.tokens' }, { set: 'themeName', value: '$.themeRow.name' }] }] },
    { message: 'notified', do: [{ call: 'unseen', onSuccess: [{ set: 'unseen', value: '$.unseenRow.total' }] }] },
    { message: 'notices-seen', do: [{ call: 'unseen', onSuccess: [{ set: 'unseen', value: '$.unseenRow.total' }] }] },
    { event: 'ui:click', ref: 'bell', do: [{ set: 'menuOpen', value: false }, { resetTo: { action: 'desk.followups', canvas: 'main' } }] },
  ],
};
