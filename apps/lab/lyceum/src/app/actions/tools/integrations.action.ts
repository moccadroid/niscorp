import type { ActionDefinition } from '@niscorp/nova';

// The controller's Integrations tool: somebody else's screen, installed live.
// Acme (apps/lab/lyceum-vendor-demo) is a bundle on another domain; this shows
// where, installs it (moss fetches it and intake checks it — the answer is
// intake's, reasons and all), approves it (every shell is rebuilt, and the
// phones have Acme on their list), and removes it again for the next rehearsal. The
// broken twin — a trigger that re-emits its own channel — is refused with the
// loop's path. server/functions/integration.functions.ts does the calls.
export const integrationsTool: ActionDefinition = {
  id: 'tools.integrations',
  title: 'Integrations',
  data: { vendor: { id: '', url: '', status: '', reasons: [] }, which: 'good', error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'url url', 'broken install', 'approve remove', 'status status', 'why why'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: 'Integrations — somebody else’s screen, installed' }] },
      { component: 'Cell', props: { area: 'url' }, children: [{ component: 'Code', props: { text: '$.vendor.url' } }] },
      { component: 'Action', ref: 'broken', props: { area: 'broken', ink: 'paper', label: 'Install the broken one' } },
      { component: 'Action', ref: 'install', props: { area: 'install', ink: 'signal', label: 'Install Acme' } },
      { component: 'Action', ref: 'approve', props: { area: 'approve', ink: 'highlight', label: 'Approve' } },
      { component: 'Action', ref: 'remove', props: { area: 'remove', ink: 'paper', label: 'Remove' } },
      { component: 'Cell', props: { area: 'status' }, children: [{ component: 'Figure', props: { label: 'Acme', value: '$.vendor.status' } }] },
      {
        component: 'Cell',
        props: { area: 'why' },
        children: [
          { component: 'Rows', props: { rows: '$.vendor.reasons', rowKey: 'reason', empty: '', columns: [{ label: 'Intake', key: 'reason', w: 1 }] } },
          { if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' } },
        ],
      },
    ],
  },
  endpoints: {
    state: { fn: 'integrations.state', target: 'vendor' },
    install: { fn: 'integrations.install', target: 'vendor', errorTarget: 'error' },
    approve: { fn: 'integrations.approve', target: 'vendor', errorTarget: 'error' },
    remove: { fn: 'integrations.remove', target: 'vendor', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'state' }] },
  triggers: [
    { event: 'ui:click', ref: 'install', do: [{ set: 'error', value: '' }, { set: 'which', value: 'good' }, { call: 'install' }] },
    { event: 'ui:click', ref: 'broken', do: [{ set: 'error', value: '' }, { set: 'which', value: 'broken' }, { call: 'install' }] },
    { event: 'ui:click', ref: 'approve', do: [{ set: 'error', value: '' }, { call: 'approve' }] },
    { event: 'ui:click', ref: 'remove', do: [{ set: 'error', value: '' }, { call: 'remove' }] },
  ],
};
