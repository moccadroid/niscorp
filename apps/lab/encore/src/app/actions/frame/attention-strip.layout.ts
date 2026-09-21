import type { LayoutNode } from '@niscorp/nova';

// One quiet line, and nothing at all before the first event: what is folded away,
// and the brief — the two things an operator can act on. How many events were
// triaged and how many passes the ceiling held back are in the card's data and in
// x-ray's panel, never here.
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
