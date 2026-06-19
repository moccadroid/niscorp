import { createShell, type ActionDefinition, type LayoutNode } from '@niscorp/nova';
import { Nova, type SlotWrapper } from '@niscorp/nova/react';

// `slotWrapper` — the one pluggable seam for wrapping an action instance's
// content as it mounts/unmounts. Nova owns no animation logic: it hands the
// wrapper identity (canvasId / instanceId / the ActionDefinition) and the
// rendered content. Here the app's wrapper animates ONLY the `main` region,
// keyed by instanceId so each newly-swapped card replays a CSS enter.

// ─── The app-supplied wrapper (animation lives entirely here) ───
const AnimatedSlot: SlotWrapper = ({ canvasId, instanceId, children }) => {
  if (canvasId !== 'main') return <>{children}</>; // controls render plain
  // A fresh key per instance restarts the keyframe on every swap.
  return (
    <div key={instanceId} className="sw-anim">
      {children}
    </div>
  );
};

// ─── Actions ───
const card = (id: string, label: string, value: string, color: string): ActionDefinition => ({
  id,
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 4 },
    children: [
      { component: 'Text', props: { size: 'sm', color: '#6b7280' }, children: label },
      { component: 'Text', props: { size: '2xl', weight: 'bold', color }, children: value },
    ],
  },
});

const cardRevenue = card('cardRevenue', 'Revenue (today)', '$48,210', '#059669');
const cardUsers = card('cardUsers', 'Active users', '12,804', '#2563eb');
const cardErrors = card('cardErrors', 'Error rate', '0.42%', '#dc2626');

const controls: ActionDefinition = {
  id: 'controls',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'row', gap: 8, align: 'center' },
    children: [
      { component: 'Text', props: { weight: 'bold' }, children: 'Swap card:' },
      { component: 'Button', ref: 'show-revenue', children: 'Revenue' },
      { component: 'Button', ref: 'show-users', props: { variant: 'secondary' }, children: 'Users' },
      { component: 'Button', ref: 'show-errors', props: { variant: 'ghost' }, children: 'Errors' },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'show-revenue', do: [{ replace: { action: 'cardRevenue', canvas: 'main' } }] },
    { event: 'ui:click', ref: 'show-users', do: [{ replace: { action: 'cardUsers', canvas: 'main' } }] },
    { event: 'ui:click', ref: 'show-errors', do: [{ replace: { action: 'cardErrors', canvas: 'main' } }] },
  ],
};

// ─── Shell ───
const shellLayout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'column', gap: 0 },
  children: [
    {
      component: 'Box',
      props: { padding: 12, background: '#f9fafb', border: true },
      children: { component: 'CanvasSlot', props: { canvasId: 'controls' } },
    },
    {
      component: 'Box',
      props: { padding: 20 },
      children: { component: 'CanvasSlot', props: { canvasId: 'main' } },
    },
  ],
};

const shell = createShell({
  canvases: [
    { id: 'controls', initial: 'controls' },
    { id: 'main', initial: 'cardRevenue' },
  ],
  canvasLayout: shellLayout,
  actions: { controls, cardRevenue, cardUsers, cardErrors },
});

export { shell };
export const Demo = () => (
  <>
    <style>{`
      @keyframes sw-slide-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
      .sw-anim { animation: sw-slide-in 240ms cubic-bezier(0.2, 0.7, 0.2, 1); }
    `}</style>
    <Nova.Shell shell={shell} slotWrapper={AnimatedSlot} />
  </>
);
