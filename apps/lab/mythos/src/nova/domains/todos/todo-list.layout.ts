import type { LayoutNode } from '@niscorp/nova';

const todoRow: LayoutNode = {
  component: 'Card',
  props: { pad: 12, hover: true },
  children: [
    {
      component: 'Stack',
      props: { direction: 'row', gap: 12, align: 'center' },
      children: [
        { component: 'Checkbox', ref: 'row-complete', props: { checked: false, payload: '$todo.todo_id' } },
        {
          component: 'Doodle',
          props: {
            kind: '$todo.bloom',
            stage: { $if: '$todo.overdue', $then: 'wilt', $else: 'sprout' },
            size: 'sm',
          },
        },
        {
          component: 'Stack',
          props: { gap: 2, grow: true },
          children: [
            { component: 'Text', props: { weight: 'medium' }, children: '{{$todo.title}}' },
            {
              if: '$todo.notes',
              then: { component: 'Text', props: { size: 'sm', tone: 'sub' }, children: '{{$todo.notes}}' },
            },
          ],
        },
        {
          component: 'Chip',
          props: {
            label: '{{$todo.due_display}}',
            tone: { $if: '$todo.overdue', $then: 'danger', $else: 'ghost' },
          },
        },
        {
          component: 'Stack',
          props: { direction: 'row', gap: 4 },
          children: [
            { component: 'Button', ref: 'row-edit', props: { label: '✎', variant: 'ghost', size: 'sm', payload: '$todo' } },
            { component: 'Button', ref: 'row-delete', props: { label: '✕', variant: 'ghost', size: 'sm', payload: '$todo' } },
          ],
        },
      ],
    },
  ],
};

const emptyPatch: LayoutNode = {
  component: 'Stack',
  props: { align: 'center', gap: 10, padding: 40 },
  children: [
    { component: 'Doodle', props: { kind: 'daisy', stage: 'bloom', size: 'lg' } },
    { component: 'Text', props: { size: 'lg', weight: 'medium' }, children: 'The patch is clear.' },
    { component: 'Text', props: { size: 'sm', tone: 'sub' }, children: 'Everything you plant from here on is pure ambition.' },
    { component: 'Button', ref: 'plant-first', props: { label: '+ Plant a todo', variant: 'primary' } },
  ],
};

export const todoListLayout: LayoutNode = {
  component: 'Surface',
  props: { mood: '$.stats.mood', fill: true },
  children: [
    {
      component: 'Stack',
      props: { gap: 14, padding: 22, maxWidth: 760 },
      children: [
        {
          component: 'Stack',
          props: { direction: 'row', gap: 10, align: 'center' },
          children: [
            { component: 'Text', props: { size: 'xl', weight: 'bold' }, children: 'The Patch' },
            { component: 'Chip', props: { label: '{{$.stats.open_count}} growing', tone: 'soft' } },
            {
              if: '$.stats.overdue_count',
              then: { component: 'Chip', props: { label: '{{$.stats.overdue_count}} wilting', tone: 'danger' } },
            },
          ],
        },
        {
          if: '$.loading',
          then: { component: 'Text', props: { tone: 'sub' }, children: 'watering…' },
          else: {
            if: '$.todos.length',
            then: {
              component: 'Stack',
              props: { gap: 8 },
              children: [{ for: '$.todos', as: 'todo', key: 'todo_id', do: todoRow }],
            },
            else: emptyPatch,
          },
        },
      ],
    },
  ],
};
