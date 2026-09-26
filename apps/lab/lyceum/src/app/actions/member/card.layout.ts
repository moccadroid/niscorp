import type { LayoutNode } from '@niscorp/nova';

// The ID card. What has not been issued yet — a title, a department — is
// hatched: "not yet" has a pattern, not a grey.
export const cardLayout: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['kick kick', 'name name', 'title quirk', 'status status'], cols: [1, 1] },
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
      then: { component: 'Cell', props: { area: 'status' }, children: [{ component: 'Label', children: 'Department of {{$.me.department_name}}' }] },
      else: { component: 'Cell', props: { area: 'status', mark: 'hatch' }, children: [{ component: 'Text', children: 'Not yet assigned. Wait for your department.' }] },
    },
  ],
};
