import type { LayoutNode } from '@niscorp/nova';

// The ID card, in full — in the phone's body. What has not been issued yet — a
// title, a department — is hatched: "not yet" has a pattern, not a grey. Your
// department, once you have one, is its mark, its sigil and its clearance in
// plain words; the layout names no department, they are your row's.
export const cardLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick', 'name name', 'title quirk', 'status status'], cols: [1, 1], rows: ['auto', 'auto', 'auto', 1] },
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
    {
      if: '$.me.department_name',
      then: {
        component: 'Cell',
        props: { area: 'status', mark: '$.me.department_mark' },
        children: [
          { component: 'Sigil', props: { shape: '$.me.department_sigil', size: 'large' } },
          { component: 'Headline', props: { level: 'name' }, children: '{{$.me.department_name}}' },
          { component: 'Text', children: '{{$.me.department_remit}}' },
        ],
      },
      else: { component: 'Cell', props: { area: 'status', mark: 'hatch', align: 'center' }, children: [{ component: 'Text', children: 'Not yet assigned. Wait for your department.' }] },
    },
  ],
};

// The card as ONE LINE, across the top of the phone: who you are and where you
// belong, always in sight and never taking the screen.
export const cardStripLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['who where'], cols: [3, 2] },
  children: [
    { component: 'Cell', props: { area: 'who' }, children: [{ component: 'Label', children: '{{$.me.name}}' }] },
    {
      if: '$.me.department_name',
      then: {
        component: 'Cell',
        props: { area: 'where', mark: '$.me.department_mark' },
        children: [{ component: 'Sigil', props: { shape: '$.me.department_sigil' } }, { component: 'Label', children: '{{$.me.department_name}}' }],
      },
      else: { component: 'Cell', props: { area: 'where', mark: 'hatch' }, children: [{ component: 'Label', children: 'Waiting' }] },
    },
  ],
};
