import type { LayoutNode } from '@niscorp/nova';

const field = (label: string, control: LayoutNode): LayoutNode => ({
  component: 'Stack',
  props: { gap: 5 },
  children: [
    { component: 'Text', props: { size: 'xs', weight: 'medium', tone: 'sub' }, children: label },
    control,
  ],
});

export const todoFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 14 },
  children: [
    {
      component: 'Text',
      props: { size: 'lg', weight: 'bold' },
      // children is a node position: the conditional NODE form, not the
      // {$if} value directive.
      children: { if: '$.todo_id', then: 'Tend this todo', else: 'Plant a todo' },
    },
    field('What needs doing?', {
      component: 'Input',
      ref: 'field-title',
      model: '$.title',
      props: { value: '$.title', placeholder: 'e.g. Water the ferns' },
    }),
    field('Notes', {
      component: 'TextArea',
      ref: 'field-notes',
      model: '$.notes',
      props: { value: '$.notes', rows: 3, placeholder: 'Optional detail…' },
    }),
    field('Due', {
      component: 'Input',
      ref: 'field-due',
      model: '$.due_date',
      props: { value: '$.due_date', type: 'date' },
    }),
    {
      if: '$.error',
      then: { component: 'Text', props: { size: 'sm', tone: 'danger' }, children: '{{$.error}}' },
    },
    {
      component: 'Stack',
      props: { direction: 'row', justify: 'end', gap: 8 },
      children: [
        { component: 'Button', ref: 'cancel', props: { label: 'Never mind', variant: 'ghost' } },
        {
          if: '$.todo_id',
          then: {
            component: 'Button',
            ref: 'save-update',
            props: {
              label: 'Save changes',
              variant: 'primary',
              disabled: { $if: '$.title', $then: false, $else: true },
            },
          },
          else: {
            component: 'Button',
            ref: 'save-create',
            props: {
              label: 'Plant it 🌱',
              variant: 'primary',
              disabled: { $if: '$.title', $then: false, $else: true },
            },
          },
        },
      ],
    },
  ],
};
