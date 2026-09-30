import type { ActionDefinition } from '@niscorp/nova';

// Q&A — two actions, placed: the form (questions.send) and, under it, the
// person's own questions (questions.mine), each on a canvas of its own that
// this layout places, the way the phone places its body. Two actions and not
// one, so the form can be opened alone — the assistant offers it without the
// list. Mounted, it places them; unmounted (the phone opened something else),
// it takes them away again.
export const questionDeskAction: ActionDefinition = {
  id: 'questions.desk',
  description: 'Q&A: the question form, and under it the person\'s own questions.',
  title: 'Q&A',
  data: { none: [] },
  layout: {
    component: 'Sheet',
    props: { size: 'fill', areas: ['form', 'mine'], rows: ['auto', 1] },
    children: [
      { component: 'Cell', props: { area: 'form', pad: 'none' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'qa-form' } }] },
      { component: 'Cell', props: { area: 'mine', pad: 'none', scroll: 'y' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'qa-mine' } }] },
    ],
  },
  lifecycle: {
    mount: [{ resetTo: { action: 'questions.send', canvas: 'qa-form' } }, { resetTo: { action: 'questions.mine', canvas: 'qa-mine' } }],
    unmount: [
      { reconcile: { to: '$.none', action: 'action', canvas: 'qa-form', own: 'canvas' } },
      { reconcile: { to: '$.none', action: 'action', canvas: 'qa-mine', own: 'canvas' } },
    ],
  },
  triggers: [],
};
