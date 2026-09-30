import type { LayoutNode } from '@niscorp/nova';

// The ID card, in full — first on the phone's list, as tall as what is on it.
// What a model has not written yet is hatched: "not yet" has a pattern, not a
// grey.
export const cardLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick kick', 'name name', 'title quirk'], cols: [1, 1] },
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
