import type { LayoutNode, Step } from '@niscorp/nova';

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

export const split = (left: LayoutNode, right: LayoutNode): LayoutNode => ({
  component: 'Row',
  props: { align: 'stretch', gap: 0, grow: true, shrink: true, h: '100%' },
  children: [
    { component: 'Box', props: { scroll: true, shrink: true, width: 400, h: '100%', px: 14, py: 12, border: 'right' }, children: left },
    { component: 'Box', props: { scroll: true, shrink: true, grow: true, h: '100%', px: 18, py: 14 }, children: right },
  ],
});

export const column = (body: LayoutNode): LayoutNode => ({
  component: 'Box',
  props: { scroll: true, shrink: true, grow: true, h: '100%', px: 16, py: 14 },
  children: body,
});

export const nothingChosen = (hint: string): LayoutNode => ({ component: 'Empty', props: { icon: 'search', title: 'Nothing selected', hint } });

export const panelTriggers: { event: string; ref: string; do: Step[] }[] = [
  { event: 'ui:click', ref: 'back', do: [{ pop: true }] },
  { event: 'ui:click', ref: 'refresh', do: [{ reload: true }] },
  { event: 'ui:click', ref: 'close', do: [{ emit: { channel: 'admin:close' } }, { pop: true }] },
];

export const errorNotice: LayoutNode = {
  if: '$.error',
  // `errorTarget` lands the whole error, `{ message, status }`, not a string.
  then: { component: 'Notice', props: { tone: 'alert', icon: 'alert', title: 'The app server did not answer' }, children: '$.error.message' },
  else: '',
};

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
