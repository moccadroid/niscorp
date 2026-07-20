import { createShell, type ActionDefinition, type LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

// Two authored layouts on one shell:
// 1. `canvasLayout` — controls bar on top, feed below.
// 2. `actionLayout` on the `feed` canvas — a column that loops
//    `$.instances` and emits an ActionSlot per entry. This is
//    list mode: every instance on screen, not just the top.

const shellLayout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 0 },
  children: [
    {
      component: 'Box',
      props: { padding: 16, background: '#f3f4f6', border: true },
      children: { component: 'CanvasSlot', props: { canvasId: 'controls' } },
    },
    {
      component: 'Box',
      props: { padding: 16 },
      children: { component: 'CanvasSlot', props: { canvasId: 'feed' } },
    },
  ],
};

const feedActionLayout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 12 },
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
      { component: 'Text', props: { weight: 'bold' }, children: 'Add to feed:' },
      { component: 'Button', ref: 'add-info', children: 'Info' },
      { component: 'Button', ref: 'add-warn', props: { variant: 'secondary' }, children: 'Warning' },
      { component: 'Button', ref: 'add-success', props: { variant: 'ghost' }, children: 'Success' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'add-info', do: [{ push: { action: 'entryInfo', canvas: 'feed' } }] },
    { event: 'ui:click', ref: 'add-warn', do: [{ push: { action: 'entryWarn', canvas: 'feed' } }] },
    { event: 'ui:click', ref: 'add-success', do: [{ push: { action: 'entrySuccess', canvas: 'feed' } }] },
  ],
};

const buildEntry = (
  id: string,
  tone: string,
  background: string,
  title: string,
  body: string,
): ActionDefinition => ({
  id,
  data: {},
  layout: {
    component: 'Box',
    props: { padding: 12, background, border: true, radius: 6 },
    children: {
      component: 'Stack',
      props: { direction: 'column', gap: 4 },
      children: [
        {
          component: 'Text',
          props: { weight: 'bold', size: 'sm', color: '#6b7280' },
          children: tone,
        },
        { component: 'Text', props: { weight: 'bold' }, children: title },
        { component: 'Text', children: body },
      ],
    },
  },
});

const entryInfo = buildEntry('entryInfo', 'INFO', '#eff6ff', 'Heads up', 'A new user signed up.');
const entryWarn = buildEntry('entryWarn', 'WARNING', '#fef3c7', 'Elevated latency', 'p95 crossed 500ms on the API.');
const entrySuccess = buildEntry('entrySuccess', 'SUCCESS', '#ecfdf5', 'Deploy green', 'Release 1.4.2 rolled out cleanly.');

const shell = createShell({
  canvases: [
    { id: 'controls', initial: 'panel' },
    { id: 'feed', actionLayout: feedActionLayout, initial: 'entryInfo' },
  ],
  canvasLayout: shellLayout,
  actions: { panel, entryInfo, entryWarn, entrySuccess },
});

export { shell };
export const Demo = () => <Nova.Shell shell={shell} />;
