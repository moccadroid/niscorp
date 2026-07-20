import { createShell, type ActionDefinition, type ActionFragment } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

// THE CORE IDEA. A fragment is chrome with a hole in it: `{ slot: 'body' }`.
// Composing an action `with: ['framed']` drops the action's own layout into that
// hole. Same action, optionally wrapped — toggle it live below.

// The fragment: a labelled border with a body slot. Pure data, no behaviour.
const framed: ActionFragment = {
  kind: 'fragment',
  id: 'framed',
  layout: {
    component: 'Box',
    props: { border: true, radius: 8 },
    children: {
      component: 'Stack',
      props: { direction: 'column' },
      children: [
        {
          component: 'Box',
          props: { padding: 8, background: '#eef2ff' },
          children: {
            component: 'Text',
            props: { size: 'sm', weight: 'bold', color: '#4f46e5' },
            children: 'framed fragment  ·  the chrome',
          },
        },
        { component: 'Box', props: { padding: 16 }, children: { slot: 'body' } },
      ],
    },
  },
};

// The action: its layout is the body. It never mentions the frame — composition
// is decided at the call site. The two buttons re-open it on the same canvas,
// once with the fragment and once without, so you see exactly what it adds.
const card: ActionDefinition = {
  id: 'card',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 10 },
    children: [
      { component: 'Text', props: { weight: 'bold' }, children: 'The action body' },
      {
        component: 'Text',
        props: { color: '#64748b', size: 'sm' },
        children: 'This Stack is the action’s own layout. The fragment wraps it — nothing here changes.',
      },
      {
        component: 'Stack',
        props: { direction: 'row', gap: 8 },
        children: [
          { component: 'Button', ref: 'framed', props: { variant: 'primary' }, children: 'Wrap with fragment' },
          { component: 'Button', ref: 'bare', props: { variant: 'secondary' }, children: 'Bare' },
        ],
      },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'framed', do: [{ replace: { action: 'card', canvas: 'stage', with: ['framed'] } }] },
    { event: 'ui:click', ref: 'bare', do: [{ replace: { action: 'card', canvas: 'stage' } }] },
  ],
};

const shell = createShell({
  canvases: [{ id: 'stage', initial: { action: 'card', with: ['framed'] } }],
  actions: { card },
  fragments: { framed },
});

export { shell };
export const Demo = () => <Nova.Shell shell={shell} />;
