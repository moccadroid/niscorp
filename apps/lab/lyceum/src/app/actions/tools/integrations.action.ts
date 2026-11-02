import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

// The speaker's tool for an integration installed from outside: install it, approve it, remove it.
const integrationTool = (id: string, integration: string, words: { kick: string; install: string; status: string; broken?: string }): ActionDefinition => {
  const broken: LayoutNode[] = words.broken === undefined ? [] : [{ component: 'Action', ref: 'broken', props: { area: 'broken', ink: 'paper', label: words.broken } }];
  return {
    id,
    title: words.kick,
    data: { integration, vendor: { id: '', url: '', status: '', reasons: [], checks: [], culprit: '' }, which: 'good', error: '' },
    layout: {
      component: 'Sheet',
      props: { areas: ['kick kick', 'url url', `${words.broken === undefined ? 'install' : 'broken'} install`, 'approve remove', 'status status', 'why why'] },
      children: [
        { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: words.kick }] },
        { component: 'Cell', props: { area: 'url' }, children: [{ component: 'Code', props: { text: '$.vendor.url' } }] },
        ...broken,
        { component: 'Action', ref: 'install', props: { area: 'install', ink: 'signal', label: words.install } },
        { component: 'Action', ref: 'approve', props: { area: 'approve', ink: 'highlight', label: 'Approve' } },
        { component: 'Action', ref: 'remove', props: { area: 'remove', ink: 'paper', label: 'Remove' } },
        { component: 'Cell', props: { area: 'status' }, children: [{ component: 'Figure', props: { label: words.status, value: '$.vendor.status' } }] },
        {
          component: 'Cell',
          props: { area: 'why' },
          children: [
            { component: 'Rows', props: { rows: '$.vendor.reasons', rowKey: 'reason', empty: '', columns: [{ label: 'Refused because', key: 'reason', w: 1 }] } },
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
      ...(words.broken === undefined ? [] : [{ event: 'ui:click', ref: 'broken', do: [{ set: 'error', value: '' }, { set: 'which', value: 'broken' }, { call: 'install' }] }]),
      { event: 'ui:click', ref: 'approve', do: [{ set: 'error', value: '' }, { call: 'approve' }] },
      { event: 'ui:click', ref: 'remove', do: [{ set: 'error', value: '' }, { call: 'remove' }] },
    ],
  };
};

export const integrationsTool = integrationTool('tools.integrations', 'qa', {
  kick: 'Integrations — somebody else’s screen, installed',
  install: 'Install the Q&A',
  status: 'The Q&A',
  broken: 'Install the broken one',
});

export const applauseTool = integrationTool('tools.applause', 'applause', {
  kick: 'Applause — somebody else’s screen, installed',
  install: 'Install Applause',
  status: 'Applause',
});
