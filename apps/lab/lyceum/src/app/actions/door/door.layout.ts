import type { LayoutNode } from '@niscorp/nova';

export const doorLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16, p: 24 },
  children: [
    { component: 'Text', props: { as: 'h1' }, children: 'Lyceum' },
    { component: 'Text', children: 'Tonight the talk is an application, and you are in it.' },
    {
      if: '$.entering',
      then: { component: 'Text', children: 'Stepping in…' },
      else: { component: 'Button', ref: 'enter', children: 'Step in' },
    },
    { if: '$.error', then: { component: 'Text', children: '{{$.error}}' } },
  ],
};
