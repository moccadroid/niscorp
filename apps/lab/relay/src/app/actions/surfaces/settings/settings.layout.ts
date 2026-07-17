import type { LayoutNode } from '@niscorp/nova';

// Settings — sectioned cards of labelled rows. Every control is two-way bound to
// `$.settings.*` via `model:`, so toggles/fields are live (persistence is a
// later, mutations-phase concern). Shows the form primitives + the Switch.
// Spelled out literally (like every screen): the layout IS the artifact.
export const settingsLayout: LayoutNode = {
  component: 'Box',
  props: { width: 'min(720px, 100%)' },
  children: {
    component: 'Stack',
    props: { gap: 18 },
    children: [
      // ─── Profile ───────────────────────────────────────────
      {
        component: 'Box',
        props: { bg: 'surface', border: true, radius: 13 },
        children: [
          { component: 'Box', props: { px: 18, py: 14, border: 'bottom' }, children: { component: 'Text', props: { weight: 600 }, children: 'Profile' } },
          {
            component: 'Box',
            props: { px: 18, py: 14, border: 'bottom' },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Display name' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Shown across the workspace' }] },
                { component: 'Box', props: { width: 220 }, children: { component: 'Input', model: '$.settings.name', props: {} } },
              ],
            },
          },
          {
            component: 'Box',
            props: { px: 18, py: 14, border: 'bottom' },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Email' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Used for sign-in and notifications' }] },
                { component: 'Box', props: { width: 220 }, children: { component: 'Input', model: '$.settings.email', props: { type: 'email' } } },
              ],
            },
          },
          {
            component: 'Box',
            props: { px: 18, py: 14 },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Role' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Determines what you can change' }] },
                { component: 'Box', props: { width: 220 }, children: { component: 'Select', model: '$.settings.role', props: { options: [{ value: 'owner', label: 'Workspace owner' }, { value: 'admin', label: 'Admin' }, { value: 'rep', label: 'Sales rep' }] } } },
              ],
            },
          },
        ],
      },
      // ─── Notifications ─────────────────────────────────────
      {
        component: 'Box',
        props: { bg: 'surface', border: true, radius: 13 },
        children: [
          { component: 'Box', props: { px: 18, py: 14, border: 'bottom' }, children: { component: 'Text', props: { weight: 600 }, children: 'Notifications' } },
          {
            component: 'Box',
            props: { px: 18, py: 14, border: 'bottom' },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Email notifications' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Activity on records you follow' }] },
                { component: 'Switch', model: '$.settings.emailNotif' },
              ],
            },
          },
          {
            component: 'Box',
            props: { px: 18, py: 14, border: 'bottom' },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Task reminders' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'A nudge before a task is due' }] },
                { component: 'Switch', model: '$.settings.taskReminders' },
              ],
            },
          },
          {
            component: 'Box',
            props: { px: 18, py: 14, border: 'bottom' },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Deal updates' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'When a deal changes stage or owner' }] },
                { component: 'Switch', model: '$.settings.dealUpdates' },
              ],
            },
          },
          {
            component: 'Box',
            props: { px: 18, py: 14 },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Weekly digest' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'A Monday summary of your pipeline' }] },
                { component: 'Switch', model: '$.settings.weeklyDigest' },
              ],
            },
          },
        ],
      },
      // ─── Workspace ─────────────────────────────────────────
      {
        component: 'Box',
        props: { bg: 'surface', border: true, radius: 13 },
        children: [
          { component: 'Box', props: { px: 18, py: 14, border: 'bottom' }, children: { component: 'Text', props: { weight: 600 }, children: 'Workspace' } },
          {
            component: 'Box',
            props: { px: 18, py: 14, border: 'bottom' },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Default pipeline' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'New deals land here' }] },
                { component: 'Box', props: { width: 220 }, children: { component: 'Select', model: '$.settings.pipeline', props: { options: [{ value: 'sales', label: 'Sales pipeline' }, { value: 'partner', label: 'Partnerships' }] } } },
              ],
            },
          },
          {
            component: 'Box',
            props: { px: 18, py: 14, border: 'bottom' },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Auto-assign deals' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Round-robin new deals to reps' }] },
                { component: 'Switch', model: '$.settings.autoAssign' },
              ],
            },
          },
          {
            component: 'Box',
            props: { px: 18, py: 14 },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Compact rows' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Denser tables across the app' }] },
                { component: 'Switch', model: '$.settings.compact' },
              ],
            },
          },
        ],
      },
      // ─── Ray (assistant) ───────────────────────────────────
      {
        component: 'Box',
        props: { bg: 'surface', border: true, radius: 13 },
        children: [
          { component: 'Box', props: { px: 18, py: 14, border: 'bottom' }, children: { component: 'Text', props: { weight: 600 }, children: 'Ray (assistant)' } },
          {
            component: 'Box',
            props: { px: 18, py: 14, border: 'bottom' },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Show debug output' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: "Stream Ray's tool calls — inputs and results — into the chat" }] },
                { component: 'Switch', ref: 'ray-debug', model: '$.rayDebug' },
              ],
            },
          },
          {
            component: 'Box',
            props: { px: 18, py: 14, border: 'bottom' },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Chat storage' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Estimated server storage your chat history is using' }] },
                { component: 'Text', props: { size: 'sm', color: 'mute', mono: true }, children: '{{$.rayStorage}}' },
              ],
            },
          },
          {
            component: 'Box',
            props: { px: 18, py: 14 },
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                { component: 'Stack', props: { gap: 2 }, children: [{ component: 'Text', props: { weight: 500 }, children: 'Clear chat sessions' }, { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Delete every saved Ray conversation' }] },
                { component: 'Button', ref: 'ray-clear-sessions', props: { variant: 'danger', size: 'sm', icon: 'trash' }, children: 'Clear sessions' },
              ],
            },
          },
        ],
      },
    ],
  },
};
