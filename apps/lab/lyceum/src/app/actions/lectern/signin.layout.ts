import type { LayoutNode } from '@niscorp/nova';

// The speaker's sign-in desk: an address, one button, and the same answer
// whatever was typed — the page says nothing about which address is the one.
export const signinLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head', 'field', 'send', 'out'], rows: ['auto', 1, 'auto', 'auto', 'auto'] },
  children: [
    { component: 'Cell', props: { area: 'kick' }, children: [{ component: 'Label', children: 'Lyceum · speaker sign-in' }] },
    {
      component: 'Cell',
      props: { area: 'head', align: 'end' },
      children: [{ component: 'Headline', props: { level: 'title' }, children: 'A link is mailed to the speaker\'s address' }],
    },
    { component: 'Field', ref: 'email', model: '$.email', props: { area: 'field', value: '$.email', placeholder: 'you@example.com' } },
    { component: 'Action', ref: 'send', props: { area: 'send', ink: 'alert', label: { $if: '$.sending', $then: 'Sending…', $else: 'Send me a link →' } } },
    {
      if: '$.error',
      then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', props: { tone: 'muted' }, children: '{{$.error.message}}' }] },
      else: {
        if: '$.sent',
        then: {
          component: 'Cell',
          props: { area: 'out', ink: 'highlight' },
          children: [{ component: 'Text', children: 'If that is the speaker\'s address, a sign-in link is on its way. It works once, within 15 minutes.' }],
        },
      },
    },
  ],
};
