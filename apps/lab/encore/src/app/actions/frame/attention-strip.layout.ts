import type { LayoutNode } from '@niscorp/nova';

// One quiet line, and nothing at all before the first event. THE APP gets what
// an operator can act on — what is folded away, and the brief. How many events
// were triaged, and how many passes the ceiling held back, is x-ray's.
export const attentionStripLayout: LayoutNode = {
  if: '$.events',
  then: {
    component: 'Stack',
    props: { gap: 4 },
    children: [
      {
        component: 'Row',
        props: { gap: 10, align: 'center', wrap: true },
        children: [
          { if: '$.xray', then: { component: 'Text', props: { value: 'watching', variant: 'label', tone: 'mute' } }, else: '' },
          { if: '$.xray', then: { component: 'Text', props: { value: '$.say', variant: 'mono', tone: 'mute' } }, else: '' },
          { if: '$.foldedSay', then: { component: 'Text', props: { value: '$.foldedSay', variant: 'tag', tone: 'warn' } }, else: '' },
          { if: { $prism: { $and: [{ $ref: '$.xray' }, { $ref: '$.ceilingSay' }] } }, then: { component: 'Text', props: { value: '$.ceilingSay', variant: 'tag', tone: 'warn' } }, else: '' },
        ],
      },
      { if: '$.brief', then: { component: 'Text', props: { value: '$.brief', tone: 'alert' } }, else: '' },
    ],
  },
  else: '',
};
