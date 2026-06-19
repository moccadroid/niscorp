import { createShell, type ActionDefinition, type ActionFragment } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// STACKING. `with` takes a list. The fragments fold in array order, each wrapping
// the result so far — so the LAST listed ends up OUTERMOST. Here `with: ['inner',
// 'outer']` nests: outer ▸ inner ▸ action. Useful for orthogonal concerns
// (e.g. an auth gate around a modal around a form).

const labelledFrame = (id: string, label: string, bg: string, color: string): ActionFragment => ({
  kind: 'fragment',
  id,
  layout: {
    component: 'Box',
    props: { border: true, radius: 8 },
    children: {
      component: 'Stack',
      props: { direction: 'column' },
      children: [
        {
          component: 'Box',
          props: { padding: 8, background: bg },
          children: { component: 'Text', props: { size: 'sm', weight: 'bold', color }, children: label },
        },
        { component: 'Box', props: { padding: 12 }, children: { slot: 'body' } },
      ],
    },
  },
});

const inner = labelledFrame('inner', 'inner fragment', '#fef3c7', '#b45309');
const outer = labelledFrame('outer', 'outer fragment', '#e0e7ff', '#4338ca');

const action: ActionDefinition = {
  id: 'leaf',
  data: {},
  layout: {
    component: 'Text',
    props: { weight: 'bold', color: '#0f172a' },
    children: 'the action body',
  },
};

// with: ['inner', 'outer'] → fold inner first (wraps the action), then outer
// (wraps that). Last listed is outermost, so you see: outer ▸ inner ▸ body.
const shell = createShell({
  canvases: [{ id: 'stage', initial: { action: 'leaf', with: ['inner', 'outer'] } }],
  actions: { leaf: action },
  fragments: { inner, outer },
});

export { shell };
export const Demo = () => <Nova.Shell shell={shell} />;
