import type { LayoutNode } from '@niscorp/nova';

export const doorLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'Sign in' },
  children: [
    { component: 'Text', props: { tone: 'lead' }, children: 'Mira is for the people its owner invited. Type your address, and Mira mails you a link that signs you in.' },
    {
      component: 'Row',
      children: [
        { component: 'Input', ref: 'email', model: '$.email', props: { placeholder: 'you@example.com' } },
        { component: 'Button', ref: 'send', props: { label: { $if: '$.sending', $then: 'Sending…', $else: 'Send me a link' } } },
      ],
    },
    { if: '$.sent', then: { component: 'Text', props: { tone: 'muted' }, children: 'If {{$.email}} was invited, a link is on its way. It works once, within 15 minutes.' } },
    { if: '$.error', then: { component: 'Text', props: { tone: 'error' }, children: '{{$.error}}' } },
  ],
};
