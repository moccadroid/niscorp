import type { ActionDefinition } from '@action';

// ═══════════════════════════════════════════════════════════
// The inspector — its OWN action, pushed onto the devtools canvas over the
// dock by any ⚙ (a dock row, an app slotWrapper's chip, a timeline detail).
// Every inspect PUSHES, so the devtools canvas builds a real stack — inspect
// from an inspector and you go deeper. Window chrome, standard semantics:
// ← (header left) is BACK — pop one level; ✕ (header right) is CLOSE —
// clear the whole stack back to a fresh dock (resetTo). Card-deck rendering
// shows the top of the stack, so the navigation is the canvas itself.
// ═══════════════════════════════════════════════════════════

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
    // ← back (pop one level) · ✕ close (clear the stack back to the dock)
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
    // ← = back: pop one level (the previous inspector, or the dock)
    { event: 'ui:click', ref: 'inspect-back', do: [{ pop: true }] },
    // ✕ = close: clear the whole stack, back to a fresh dock at the root
    { event: 'ui:click', ref: 'inspect-close', do: [{ resetTo: { action: 'devtools.dock' } }] },
    // an inspect from here goes DEEPER — another inspector on the stack
    { event: 'ui:click', ref: 'inspect', do: [{ push: { action: 'devtools.inspect', input: { instanceId: '@event.payload' } } }] },
  ],
};
