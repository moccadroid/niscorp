import { createShell, type ActionDefinition, type LayoutNode } from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// The shell's own canvasLayout is a LayoutNode — the same tree
// language used inside actions. Here it's a row of two panels,
// but the second panel is wrapped in an `if`: it only renders
// when the detail canvas has an active action. Pop the detail
// and the whole right panel *disappears* — this is a real layout
// change, not a CSS visibility toggle.

const shellLayout: LayoutNode = {
  component: 'Stack',
  props: { direction: 'row', gap: 0 },
  children: [
    {
      component: 'Box',
      props: { padding: 16 },
      children: { component: 'CanvasSlot', props: { canvasId: 'list' } },
    },
    {
      if: '$.canvases.1.active',
      then: {
        component: 'Box',
        props: { padding: 16, background: '#f3f4f6', border: true },
        children: { component: 'CanvasSlot', props: { canvasId: 'detail' } },
      },
    },
  ],
};

const list: ActionDefinition = {
  id: 'list',
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 12 },
    children: [
      { component: 'Text', props: { weight: 'bold', size: 'lg' }, children: 'Contacts' },
      {
        component: 'Text',
        props: { size: 'sm', color: '#6b7280' },
        children:
          'Pick a contact to open the detail panel on the right. Close it to make the panel disappear.',
      },
      { component: 'Button', ref: 'open-ada', children: 'Ada Lovelace' },
      {
        component: 'Button',
        ref: 'open-alan',
        props: { variant: 'secondary' },
        children: 'Alan Turing',
      },
      {
        component: 'Button',
        ref: 'open-grace',
        props: { variant: 'ghost' },
        children: 'Grace Hopper',
      },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'open-ada',
      do: [{ replace: { action: 'detailAda', canvas: 'detail' } }],
    },
    {
      event: 'ui:click',
      ref: 'open-alan',
      do: [{ replace: { action: 'detailAlan', canvas: 'detail' } }],
    },
    {
      event: 'ui:click',
      ref: 'open-grace',
      do: [{ replace: { action: 'detailGrace', canvas: 'detail' } }],
    },
  ],
};

const buildDetail = (id: string, name: string, role: string, bio: string): ActionDefinition => ({
  id,
  data: {},
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 8 },
    children: [
      { component: 'Text', props: { weight: 'bold', size: 'lg' }, children: name },
      { component: 'Text', props: { size: 'sm', color: '#6b7280' }, children: role },
      { component: 'Text', children: bio },
      { component: 'Button', ref: 'close', props: { variant: 'secondary' }, children: 'Close' },
    ],
  },
  triggers: [{ event: 'ui:click', ref: 'close', do: [{ pop: true }] }],
});

const detailAda = buildDetail(
  'detailAda',
  'Ada Lovelace',
  'Mathematician, 1815–1852',
  'First programmer; wrote what is considered the first algorithm intended for a computing machine.',
);
const detailAlan = buildDetail(
  'detailAlan',
  'Alan Turing',
  'Logician, 1912–1954',
  'Formalised the concepts of algorithm and computation with the Turing machine.',
);
const detailGrace = buildDetail(
  'detailGrace',
  'Grace Hopper',
  'Computer scientist, 1906–1992',
  'Pioneered the development of compilers and the concept of machine-independent programming languages.',
);

const shell = createShell({
  canvases: [{ id: 'list', initial: 'list' }, { id: 'detail' }],
  canvasLayout: shellLayout,
  actions: { list, detailAda, detailAlan, detailGrace },
});

export { shell };
export const Demo = () => <Nova.Shell shell={shell} />;
