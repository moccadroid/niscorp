import type { LayoutNode } from '@niscorp/nova';

// The shell FRAME — served to terminals as data. One frame for every audience:
// what differs between a guest's phone and a clerk's desk is which canvases have
// anything on them, not a second arrangement.
//
//   chrome     who you are, which house, the way out
//   nav        the staff launcher — one bar
//   main       furniture: the guest's concierge, the login page
//   home       the guest's own composed surface
//   work       the LIST column — the queue, the inbox, the arrivals
//   detail     the RECORD column — the one thing being worked, beside its list
//   aside      the ASSISTANT's column, and only the assistant's
//   sheet      the overlay
//   assistant  the dock
//
// WHY `work` AND `detail` ARE TWO CANVASES. They were briefly one stack, and a
// clerk who opened an issue lost the queue and had to press Back to get it
// again. The monolithic board had this right by accident — its layout was a grid
// with the list in one cell and the open record in the other — and splitting the
// action into addressable pieces threw the arrangement away with the branch.
// Two canvases put it back and keep the addressability: the list persists, the
// record replaces itself beside it, and a form stacks over the record it is
// about.
export const frameLayout: LayoutNode = {
  component: 'Stack',
  props: { h: '100vh' },
  children: [
    { component: 'CanvasSlot', props: { canvasId: 'chrome' } },
    // ONE top bar: the staff launcher, as a band under the header.
    {
      // A rule under it, so the bar is a band rather than a card adrift
      // between the header and the work.
      component: 'Box',
      props: { border: 'bottom', px: 20, py: 6 },
      children: { component: 'CanvasSlot', props: { canvasId: 'nav' } },
    },
    {
      // Named regions, so the assistant's territory frame has something to
      // land on: the stylesheet styles `columns` and `aside` when the document
      // root says the region is the assistant's (data-assist, written by the
      // dock's AssistState). The frame is static, so the state cannot live
      // here — only the names can.
      component: 'Region',
      props: { name: 'columns' },
      children: {
        component: 'Row',
        props: { grow: true, shrink: true, align: 'stretch', wrap: true },
        children: [
          // The guest's single column — furniture, then their composed surface.
          {
            component: 'Box',
            props: { grow: true, scroll: true, shrink: true, h: '100%' },
            children: [
              { component: 'CanvasSlot', props: { canvasId: 'main' } },
              { component: 'CanvasSlot', props: { canvasId: 'home' } },
              { component: 'CanvasSlot', props: { canvasId: 'work' } },
            ],
          },
          { component: 'CanvasSlot', props: { canvasId: 'detail' } },
          { component: 'Region', props: { name: 'aside' }, children: { component: 'CanvasSlot', props: { canvasId: 'aside' } } },
        ],
      },
    },
    { component: 'CanvasSlot', props: { canvasId: 'sheet' } },
    { component: 'CanvasSlot', props: { canvasId: 'assistant' } },
  ],
};
