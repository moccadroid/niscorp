import type { LayoutNode } from '@niscorp/nova';

// The ID card, in full — in the phone's body. What a model has not written yet
// is hatched: "not yet" has a pattern, not a grey.
export const cardLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick', 'name name', 'title quirk'], cols: [1, 1], rows: ['auto', 'auto', 1] },
  children: [
    { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'ID card' }] },
    { component: 'Cell', props: { area: 'name' }, children: [{ component: 'Headline', props: { level: 'title' }, children: '{{$.me.name}}' }] },
    {
      if: '$.me.title',
      then: { component: 'Cell', props: { area: 'title' }, children: [{ component: 'Label', children: 'Title' }, { component: 'Text', children: '{{$.me.title}}' }] },
      else: { component: 'Cell', props: { area: 'title', mark: 'hatch' }, children: [{ component: 'Label', children: 'Title — being issued' }] },
    },
    {
      if: '$.me.quirk',
      then: { component: 'Cell', props: { area: 'quirk' }, children: [{ component: 'Label', children: 'On file' }, { component: 'Text', children: '{{$.me.quirk}}' }] },
      else: { component: 'Cell', props: { area: 'quirk', mark: 'hatch' }, children: [{ component: 'Label', children: 'On file — pending' }] },
    },
  ],
};

// The card as ONE LINE, across the top of the phone: who you are, always in
// sight and never taking the screen.
export const cardStripLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['who'] },
  children: [{ component: 'Cell', props: { area: 'who' }, children: [{ component: 'Label', children: '{{$.me.name}}' }] }],
};
