import type { ActionDefinition } from '@niscorp/nova';
import { TAB_BUTTON, TAB_INPUT, TAB_OPENED } from '@lyceum/app/actions/shared/tab.layouts';

// THE Q&A TAB — two actions, placed: the form (questions.send) and, under it,
// the person's own questions (questions.mine), each on a canvas of its own that
// this layout places, the way the phone places its regions. Two actions and not
// one, so the form can be opened alone — the assistant offers it without the
// list. The tab places them when it is pressed: a tab and the surface it opens
// are the same action, and only the press means "open".
export const questionDeskAction: ActionDefinition = {
  id: 'questions.desk',
  description: 'The Q&A tab: the question form, and under it the person\'s own questions.',
  title: 'Q&A',
  data: { tab: false, tabLabel: 'Q&A', tabInk: 'paper', nextInk: 'paper' },
  input: TAB_INPUT,
  layout: {
    if: '$.tab',
    then: TAB_BUTTON,
    else: {
      component: 'Sheet',
      props: { size: 'fill', areas: ['form', 'mine'], rows: ['auto', 1] },
      children: [
        { component: 'Cell', props: { area: 'form', pad: 'none' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'qa-form' } }] },
        { component: 'Cell', props: { area: 'mine', pad: 'none', scroll: 'y' }, children: [{ component: 'CanvasSlot', props: { canvasId: 'qa-mine' } }] },
      ],
    },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'open',
      do: [
        { set: 'nextInk', value: 'ink' },
        { emit: { channel: 'tab-opened' } },
        { resetTo: { action: 'questions.desk', canvas: 'body' } },
        { resetTo: { action: 'questions.send', canvas: 'qa-form' } },
        { resetTo: { action: 'questions.mine', canvas: 'qa-mine' } },
      ],
    },
    TAB_OPENED,
  ],
};
