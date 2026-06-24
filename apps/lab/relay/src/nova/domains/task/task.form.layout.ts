import type { LayoutNode } from '@niscorp/nova';

// The new-task form body — wrapped by the `modal` fragment at the push. Each
// field is two-way bound to the action data (`$.title`, `$.due`, …): the FORM's
// shape, NOT the tasks table. The `task.create` input prism (new-task.prism.ts)
// maps it to columns (renaming due → due_date, coercing empty → null; priority
// has no column and is dropped). Literal + serializable.
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
  ],
};
