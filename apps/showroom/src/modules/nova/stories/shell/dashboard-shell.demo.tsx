import {
  createComponentRegistry,
  createLayoutStore,
  createShell,
  type ActionDefinition,
  type LayoutNode,
} from '@niscorp/nova';
import {
  NovaShellProvider,
  RenderTree,
  useShellRenderTree,
  type NovaComponent,
} from '@niscorp/nova/react';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';

// The shell's `canvasLayout` is a NESTED LayoutNode: an outer
// column (topbar + body) and an inner row (two boxed panels).
// Each topbar click does TWO things — `replace` the widget on
// the metrics canvas AND `push` an event onto the activity
// canvas, which runs in list mode.

const shellLayout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 0 },
  children: [
    {
      component: 'Box',
      props: { padding: 12, background: '#1f2937' },
      children: { component: 'CanvasSlot', props: { canvasId: 'topbar' } },
    },
    {
      component: 'Stack',
      props: { direction: 'row', gap: 16, padding: 16 },
      children: [
        {
          component: 'Box',
          props: { padding: 16, background: '#ffffff', border: true, radius: 8 },
          children: { component: 'CanvasSlot', props: { canvasId: 'metrics' } },
        },
        {
          component: 'Box',
          props: { padding: 16, background: '#f9fafb', border: true, radius: 8 },
          children: { component: 'CanvasSlot', props: { canvasId: 'activity' } },
        },
      ],
    },
  ],
};

const activityActionLayout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 6 },
  children: [
    { component: 'Text', props: { weight: 'bold', size: 'sm', color: '#374151' }, children: 'ACTIVITY' },
    {
      for: '$.instances',
      as: 'i',
      key: 'id',
      do: { component: 'ActionSlot', props: { instanceId: '$.i.id' } },
    },
  ],
};

const topbar: ActionDefinition = {
  id: 'topbar',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'row', gap: 8, align: 'center' },
    children: [
      { component: 'Text', props: { weight: 'bold', color: '#f9fafb' }, children: 'Nisc Metrics' },
      { component: 'Button', ref: 'show-revenue', children: 'Revenue' },
      { component: 'Button', ref: 'show-users', props: { variant: 'secondary' }, children: 'Users' },
      { component: 'Button', ref: 'show-errors', props: { variant: 'ghost' }, children: 'Errors' },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'show-revenue',
      do: [
        { replace: { action: 'widgetRevenue', canvas: 'metrics' } },
        { push: { action: 'eventRevenue', canvas: 'activity' } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'show-users',
      do: [
        { replace: { action: 'widgetUsers', canvas: 'metrics' } },
        { push: { action: 'eventUsers', canvas: 'activity' } },
      ],
    },
    {
      event: 'ui:click',
      ref: 'show-errors',
      do: [
        { replace: { action: 'widgetErrors', canvas: 'metrics' } },
        { push: { action: 'eventErrors', canvas: 'activity' } },
      ],
    },
  ],
};

const buildWidget = (id: string, label: string, value: string, color: string): ActionDefinition => ({
  id,
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 4 },
    children: [
      { component: 'Text', props: { size: 'sm', color: '#6b7280', weight: 'medium' }, children: label },
      { component: 'Text', props: { size: '2xl', weight: 'bold', color }, children: value },
    ],
  },
});

const widgetRevenue = buildWidget('widgetRevenue', 'Revenue (today)', '$48,210', '#059669');
const widgetUsers = buildWidget('widgetUsers', 'Active users', '12,804', '#2563eb');
const widgetErrors = buildWidget('widgetErrors', 'Error rate', '0.42%', '#dc2626');

const buildEvent = (id: string, text: string): ActionDefinition => ({
  id,
  data: {},
  layout: {
    component: 'Text',
    props: { size: 'sm', color: '#374151' },
    children: text,
  },
});

const eventRevenue = buildEvent('eventRevenue', 'Revenue widget viewed');
const eventUsers = buildEvent('eventUsers', 'Users widget viewed');
const eventErrors = buildEvent('eventErrors', 'Errors widget viewed');

const registry = createComponentRegistry<NovaComponent>();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();

const shell = createShell({
  canvases: [
    { id: 'topbar' },
    { id: 'metrics' },
    { id: 'activity', actionLayout: activityActionLayout },
  ],
  canvasLayout: shellLayout,
  registry,
  layoutStore,
  actions: {
    topbar,
    widgetRevenue,
    widgetUsers,
    widgetErrors,
    eventRevenue,
    eventUsers,
    eventErrors,
  },
});
shell.push('topbar', 'topbar');
shell.push('metrics', 'widgetRevenue');
shell.push('activity', 'eventRevenue');

export { shell, registry };

const ShellView = () => <RenderTree nodes={useShellRenderTree()} />;

export const Demo = () => (
  <NovaShellProvider shell={shell} registry={registry}>
    <ShellView />
  </NovaShellProvider>
);
