import type { LayoutNode } from '@niscorp/nova';

// The task form body — the modal chrome is the `modal` fragment. Each field is
// two-way bound to the action data (`$.title`, `$.due`, …): the FORM's shape, NOT
// the tasks table. The `task.upsert` input prism maps it to columns (due →
// due_date, empty → null; priority dropped).
export const taskFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 13 },
  children: [
    { component: 'Input', model: '$.title', props: { label: 'Task', placeholder: 'What needs doing?', required: true } },
    { component: 'Input', model: '$.due', props: { label: 'Due date', type: 'date' } },
    {
      component: 'Select',
      model: '$.priority',
      props: {
        label: 'Priority',
        placeholder: 'Select…',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ],
      },
    },
    // The form's own footer — buttons here, handled by the action's triggers.
    {
      component: 'FormFoot',
      children: [
        { component: 'Button', ref: 'cancel', props: { variant: 'default' }, children: 'Cancel' },
        { component: 'Button', ref: 'confirm', props: { variant: 'primary' }, children: '$.confirmLabel' },
      ],
    },
  ],
};
