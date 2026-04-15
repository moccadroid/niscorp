import { createShell, type ActionDefinition, type LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// The same list-mode trick as the activity feed, but with
// direction: 'row' and wrap: true. One prop change turns a
// vertical timeline into a wrapping kanban strip.

const shellLayout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 0 },
  children: [
    {
      component: 'Box',
      props: { padding: 12, background: '#f3f4f6', border: true },
      children: { component: 'CanvasSlot', props: { canvasId: 'controls' } },
    },
    {
      component: 'Box',
      props: { padding: 16 },
      children: { component: 'CanvasSlot', props: { canvasId: 'board' } },
    },
  ],
};

const boardActionLayout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'row', gap: 12, wrap: true },
  children: [
    {
      for: '$.instances',
      as: 'i',
      key: 'id',
      do: { component: 'ActionSlot', props: { instanceId: '$.i.id' } },
    },
  ],
};

const panel: ActionDefinition = {
  id: 'panel',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'row', gap: 8, align: 'center' },
    children: [
      { component: 'Text', props: { weight: 'bold' }, children: 'Add task:' },
      { component: 'Button', ref: 'add-todo', children: 'Todo' },
      { component: 'Button', ref: 'add-doing', props: { variant: 'secondary' }, children: 'Doing' },
      { component: 'Button', ref: 'add-done', props: { variant: 'ghost' }, children: 'Done' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'add-todo', do: [{ push: { action: 'cardTodo', canvas: 'board' } }] },
    { event: 'ui:click', ref: 'add-doing', do: [{ push: { action: 'cardDoing', canvas: 'board' } }] },
    { event: 'ui:click', ref: 'add-done', do: [{ push: { action: 'cardDone', canvas: 'board' } }] },
  ],
};

const buildCard = (id: string, status: string, background: string, title: string): ActionDefinition => ({
  id,
  data: {},
  layout: {
    component: 'Box',
    props: { padding: 12, background, border: true, radius: 8 },
    children: {
      component: 'Stack',
      props: { direction: 'column', gap: 6 },
      children: [
        {
          component: 'Text',
          props: { weight: 'bold', size: 'sm', color: '#6b7280' },
          children: status,
        },
        { component: 'Text', props: { weight: 'bold' }, children: title },
      ],
    },
  },
});

const cardTodo = buildCard('cardTodo', 'TODO', '#fee2e2', 'Wire up auth provider');
const cardDoing = buildCard('cardDoing', 'DOING', '#fef3c7', 'Refactor canvas layouts');
const cardDone = buildCard('cardDone', 'DONE', '#dcfce7', 'Ship list-mode actionLayout');

const shell = createShell({
  canvases: [
    { id: 'controls', initial: 'panel' },
    { id: 'board', actionLayout: boardActionLayout, initial: ['cardTodo', 'cardDoing', 'cardDone'] },
  ],
  canvasLayout: shellLayout,
  actions: { panel, cardTodo, cardDoing, cardDone },
});

export { shell };
export const Demo = () => <Nova.Shell shell={shell} />;
