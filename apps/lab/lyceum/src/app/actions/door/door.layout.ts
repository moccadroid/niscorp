import type { LayoutNode } from '@niscorp/nova';

// The door, on a phone: the claim, one sentence, and the one thing to press.
export const doorLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head', 'body', 'enter'], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'Lyceum' }] },
    {
      component: 'Cell',
      props: { area: 'head', align: 'end' },
      children: [{ component: 'Headline', props: { level: 'title' }, children: 'The talk is an app, and you are in it' }],
    },
    {
      component: 'Cell',
      props: { area: 'body' },
      children: [
        { component: 'Text', children: 'Tonight the talk is an application, and you are in it.' },
        { if: '$.error', then: { component: 'Text', props: { tone: 'muted' }, children: '{{$.error.message}}' } },
      ],
    },
    {
      component: 'Action',
      ref: 'enter',
      props: { area: 'enter', ink: 'ink', size: 'large', label: { $if: '$.entering', $then: 'Stepping in…', $else: 'Step in →' } },
    },
  ],
};
