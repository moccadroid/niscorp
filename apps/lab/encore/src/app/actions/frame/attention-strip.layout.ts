import type { LayoutNode } from '@niscorp/nova';

export const attentionStripLayout: LayoutNode = {
  if: '$.events',
  then: {
    component: 'Stack',
    props: { gap: 4 },
    children: [
      { if: '$.foldedSay', then: { component: 'Text', props: { value: '$.foldedSay', variant: 'tag', tone: 'warn' } }, else: '' },
      { if: '$.brief', then: { component: 'Text', props: { value: '$.brief', tone: 'alert' } }, else: '' },
    ],
  },
  else: '',
};
