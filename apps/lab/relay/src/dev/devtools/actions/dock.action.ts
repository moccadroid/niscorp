import type { ActionDefinition } from '@niscorp/nova';
import { dockLayout } from './dock.layout';

// The devtools dock — a plain Nova action on the `devtools` canvas. All state
// (open, tab, pause, filters) is action data; all computation is `fn:`
// endpoints; the timeline feed is nova's own flow: the taps publish a bare
// `devtools:entry` notification (message payloads don't exist) and the trigger
// answers with `call: pull`, whose result lands at `target: 'view'`.
//
// While an inspector is pushed on top, this action is SUSPENDED and reacts to
// nothing — the `resume` hook re-syncs everything on pop.
export const dockAction: ActionDefinition = {
  id: 'devtools.dock',
  name: 'Nova devtools dock',
  data: {
    open: false,
    tab: 'shell',
    paused: false,
    showNav: true,
    showData: true,
    showNet: true,
    view: { rows: [], maxId: 0, total: 0, behind: 0 },
    shell: { canvases: [], layouts: '' },
    audit: { rows: [], address: 0, explained: 0, definitions: 0 },
    expanded: 0,
    auditOpen: '',
    copied: false,
  },
  layout: dockLayout,
  endpoints: {
    pull: { fn: 'devtools.pull', target: 'view' },
    clear: { fn: 'devtools.clear', target: 'view' },
    shellState: { fn: 'devtools.shellState', target: 'shell' },
    audit: { fn: 'devtools.audit', target: 'audit' },
    copyReport: { fn: 'devtools.copyReport', target: 'copied' },
    logReport: { fn: 'devtools.logReport' },
  },
  lifecycle: {
    mount: [{ call: 'shellState' }, { call: 'audit' }, { call: 'pull' }],
    resume: [{ call: 'shellState' }, { call: 'audit' }, { call: 'pull' }],
  },
  triggers: [
    // Feed notifications from the taps.
    { message: 'devtools:entry', do: [{ call: 'pull' }] },
    { message: 'devtools:state', do: [{ call: 'shellState' }, { call: 'pull' }] },
    // Chrome.
    { event: 'ui:click', ref: 'dock-toggle', do: [{ toggle: 'open' }] },
    { event: 'ui:click', ref: 'tab-shell', do: [{ set: 'tab', value: 'shell' }, { call: 'shellState' }] },
    { event: 'ui:click', ref: 'tab-timeline', do: [{ set: 'tab', value: 'timeline' }, { call: 'pull' }] },
    { event: 'ui:click', ref: 'tab-audit', do: [{ set: 'tab', value: 'audit' }, { set: 'copied', value: false }, { call: 'audit' }] },
    // Timeline controls.
    { event: 'ui:click', ref: 'pause', do: [{ toggle: 'paused' }, { call: 'pull' }] },
    { event: 'ui:click', ref: 'clear', do: [{ set: 'paused', value: false }, { set: 'expanded', value: 0 }, { call: 'clear' }] },
    { event: 'ui:click', ref: 'filter-nav', do: [{ toggle: 'showNav' }, { call: 'pull' }] },
    { event: 'ui:click', ref: 'filter-data', do: [{ toggle: 'showData' }, { call: 'pull' }] },
    { event: 'ui:click', ref: 'filter-net', do: [{ toggle: 'showNet' }, { call: 'pull' }] },
    // Row expansion — one ref serves every row via the Button `value` payload.
    { event: 'ui:click', ref: 'expand', do: [{ set: 'expanded', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'audit-open', do: [{ set: 'auditOpen', value: '@event.payload' }] },
    // Reports.
    { event: 'ui:click', ref: 'copy-report', do: [{ call: 'copyReport' }] },
    { event: 'ui:click', ref: 'log-report', do: [{ call: 'logReport' }] },
    // Drill into an instance from the shell tab — composed with the shared
    // devtools panel chrome (title + ✕).
    {
      event: 'ui:click',
      ref: 'inspect',
      do: [{ push: { action: 'devtools.inspect', canvas: 'devtools', input: { instanceId: '@event.payload' }, with: ['devtools.frame'] } }],
    },
  ],
};
