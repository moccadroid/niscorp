import type { LayoutNode, Step } from '@niscorp/nova';

// The chrome every pane wears — and the reason there is no nav bar in this tool.
//
// A pane IS the dock, open. It draws the same fixed corner surface the pill
// draws, so opening one does not reveal a panel: it replaces the pill with
// itself on the canvas stack. Back pops, and the pill is underneath where it
// always was. The stack is the navigation, which is why nothing here has to be
// told which pane is current.
export const panel = (title: string, hint: string, body: LayoutNode): LayoutNode => ({
  component: 'Dock',
  props: { open: true, side: 'left', wide: true },
  children: {
    component: 'Stack',
    props: { gap: 0, h: '100%', shrink: true },
    children: [
      {
        component: 'Box',
        props: { px: 16, py: 11, border: 'bottom' },
        children: {
          component: 'Row',
          props: { justify: 'between', align: 'center', gap: 10 },
          children: [
            {
              component: 'Row',
              props: { gap: 10, align: 'center' },
              children: [
                { component: 'Button', ref: 'back', props: { variant: 'plain', icon: 'back', label: 'Back to the panes' }, children: '' },
                {
                  component: 'Stack',
                  props: { gap: 0 },
                  children: [
                    { component: 'Text', props: { serif: true, size: 'lg' }, children: title },
                    { component: 'Text', props: { size: 'xs', color: 'faint' }, children: hint },
                  ],
                },
              ],
            },
            {
              component: 'Row',
              props: { gap: 2, align: 'center' },
              children: [
                { component: 'Button', ref: 'refresh', props: { variant: 'plain', icon: 'arrow', label: 'Re-read this pane' }, children: '' },
                { component: 'Button', ref: 'close', props: { variant: 'plain', icon: 'close', label: 'Close the admin dock' }, children: '' },
              ],
            },
          ],
        },
      },
      { component: 'Box', props: { grow: true, shrink: true }, children: body },
    ],
  },
});

// TWO COLUMNS, each with its own scrollbar — the shape every pane in here wants.
//
// A subject list on the left, the detail of whatever is chosen on the right.
// One column meant picking something at the top and then scrolling past it to
// read the answer, which is the wrong way round: the list is how you navigate
// and it must stay where it was while the right-hand side changes.
export const split = (left: LayoutNode, right: LayoutNode): LayoutNode => ({
  component: 'Row',
  props: { align: 'stretch', gap: 0, grow: true, shrink: true, h: '100%' },
  children: [
    { component: 'Box', props: { scroll: true, shrink: true, width: 400, h: '100%', px: 14, py: 12, border: 'right' }, children: left },
    { component: 'Box', props: { scroll: true, shrink: true, grow: true, h: '100%', px: 18, py: 14 }, children: right },
  ],
});

// One scrolling column, for the pane whose subject really is a single list.
export const column = (body: LayoutNode): LayoutNode => ({
  component: 'Box',
  props: { scroll: true, shrink: true, grow: true, h: '100%', px: 16, py: 14 },
  children: body,
});

// What the right-hand column says before anything is chosen. Every pane needs
// one and they should not each invent their own.
export const nothingChosen = (hint: string): LayoutNode => ({ component: 'Empty', props: { icon: 'search', title: 'Nothing selected', hint } });

// The three controls the chrome fires, identical in every pane.
//
// `close` says so on a channel before it pops: the pill owns whether it is
// open, and it is a different instance from the one being closed. A shout is
// the honest way for one action to tell another something about itself — the
// alternative is reaching into its data, which nothing in this stack does.
export const panelTriggers: { event: string; ref: string; do: Step[] }[] = [
  { event: 'ui:click', ref: 'back', do: [{ pop: true }] },
  { event: 'ui:click', ref: 'refresh', do: [{ reload: true }] },
  { event: 'ui:click', ref: 'close', do: [{ emit: { channel: 'admin:close' } }, { pop: true }] },
];

// A failed seam call is an ordinary condition — the app server may be down, or
// the key may be wrong — so every pane renders the sentence rather than showing
// an empty pane that looks like an answer.
export const errorNotice: LayoutNode = {
  if: '$.error',
  // `errorTarget` lands the whole error — `{ message, status }` — so the sentence
  // is `.message`. Binding the object rendered as "[object Object]".
  then: { component: 'Notice', props: { tone: 'alert', icon: 'alert', title: 'The app server did not answer' }, children: '$.error.message' },
  else: '',
};

// A labelled strip of chips — data keys, input keys, component vocabulary. The
// same shape recurs in every inspector, so it is written once.
export const chips = (label: string, list: string, tone = 'neutral'): LayoutNode => ({
  component: 'Stack',
  props: { gap: 4 },
  children: [
    { component: 'Text', props: { size: 'xs', color: 'faint' }, children: label },
    {
      component: 'Row',
      props: { gap: 5, wrap: true },
      children: { for: list, as: 'chip', key: 'label', do: { component: 'Badge', props: { tone }, children: '$chip.label' } },
    },
  ],
});
