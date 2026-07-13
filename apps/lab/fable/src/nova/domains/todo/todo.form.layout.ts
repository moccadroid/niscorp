import type { LayoutNode } from '@niscorp/nova';

// Fields are two-way bound to the FORM's own data (`$.title`, `$.due`, …) —
// not the DB shape; the .prism.ts seam maps on save. The modal chrome
// (overlay/card/title/✕) comes from the `modal` fragment at push time; the
// form owns its own footer so it submits on any canvas.
export const todoFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 13 },
  children: [
    { component: 'Input', ref: 'title', model: '$.title', props: { label: 'Todo', placeholder: 'What needs doing?', required: true } },
    { component: 'Textarea', ref: 'notes', model: '$.notes', props: { label: 'Notes', placeholder: 'Anything worth remembering…', rows: 3 } },
    {
      component: 'Row',
      props: { gap: 12, align: 'start' },
      children: [
        { component: 'Input', ref: 'due', model: '$.due', props: { label: 'Due date', type: 'date' } },
        {
          component: 'Select',
          ref: 'priority',
          model: '$.priority',
          props: {
            label: 'Priority',
            options: [
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ],
          },
        },
      ],
    },
    {
      component: 'Row',
      props: { class: 'fb-form__foot' },
      children: [
        { component: 'Button', ref: 'cancel', props: { variant: 'default' }, children: 'Cancel' },
        { component: 'Button', ref: 'confirm', props: { variant: 'primary' }, children: '$.confirmLabel' },
      ],
    },
  ],
};
