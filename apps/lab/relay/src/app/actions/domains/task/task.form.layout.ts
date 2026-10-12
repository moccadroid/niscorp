import type { LayoutNode } from '@niscorp/nova';

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
    {
      component: 'FormFoot',
      children: [
        { component: 'Button', ref: 'cancel', props: { variant: 'default' }, children: 'Cancel' },
        { component: 'Button', ref: 'confirm', props: { variant: 'primary' }, children: '$.confirmLabel' },
      ],
    },
  ],
};
