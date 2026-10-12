import type { ActionDefinition } from '@action';

export const inspectAction: ActionDefinition = {
  id: 'devtools.inspect',
  title: '⚙ {{$.instance.id}}',
  input: {
    type: 'object',
    properties: { instanceId: { type: 'string', description: 'The instance to inspect.' } },
  },
  data: {
    instanceId: '',
    instance: { id: '', found: false },
  },
  layout: {
    component: 'Panel',
    props: { title: '⚙ {{$.instance.id}}', backRef: 'inspect-back', closeRef: 'inspect-close' },
    children: {
      component: 'Stack',
      props: { gap: 8 },
      children: [
        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.instance.id}} · {{$.instance.canvasId}} · {{$.instance.status}}' },
        { if: { $eq: ['$.instance.found', false] }, then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'not mounted — it unmounted since this reference was recorded' } },
        { component: 'JsonTree', props: { value: '$.instance.data', label: 'data' } },
        { component: 'JsonTree', props: { value: '$.instance.layout', label: 'layout' } },
        { component: 'JsonTree', props: { value: '$.instance.issues', label: 'audit' } },
      ],
    },
  },
  endpoints: {
    describe: { fn: 'devtools.describe', target: 'instance' },
  },
  lifecycle: { mount: [{ call: 'describe' }] },
  triggers: [
    { event: 'ui:click', ref: 'inspect-back', do: [{ pop: true }] },
    { event: 'ui:click', ref: 'inspect-close', do: [{ resetTo: { action: 'devtools.dock' } }] },
    { event: 'ui:click', ref: 'inspect', do: [{ push: { action: 'devtools.inspect', input: { instanceId: '@event.payload' } } }] },
  ],
};
