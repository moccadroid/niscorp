import type { LayoutNode } from '@niscorp/nova';

export const loginLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 28, maxWidth: 420, center: true },
  children: [
    {
      component: 'Hero',
      props: { eyebrow: 'Lyra', title: 'Sign in', lead: 'We will email you a link. No password to remember, and none to lose.' },
    },

    // Sent, or asking. Two shapes of one surface, so nothing navigates and
    // the address stays on screen behind the confirmation.
    {
      if: '$.sent',
      then: {
        component: 'Stack',
        props: { gap: 14 },
        children: [
          { component: 'Notice', props: { tone: 'good', title: 'Check your email', message: 'A sign-in link is on its way to {{$.email}}. It is good for fifteen minutes.' } },
          { component: 'Button', props: { variant: 'ghost', label: 'Use a different address' }, ref: 'back' },
        ],
      },
      else: {
        component: 'Stack',
        props: { gap: 12 },
        children: [
          {
            component: 'Input',
            props: { type: 'email', label: 'Email', placeholder: 'you@studio.com', big: true, submitRef: 'send' },
            ref: 'email',
            model: '$.email',
          },
          { component: 'Button', props: { variant: 'solid', big: true, full: true, label: 'Email me a link', disabled: '$.busy' }, ref: 'send' },
          { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
        ],
      },
    },

    // ── the lab's inbox ──
    { if: '$.people.length', then: { component: 'Rule', props: { my: 4 } }, else: '' },
    {
      if: '$.people.length',
      then: {
        component: 'Stack',
        props: { gap: 8 },
        children: [
          { component: 'Text', props: { size: 'xs', color: 'faint', uppercase: true, weight: 'semi' }, children: 'Or sign in as — demo only' },
          {
            component: 'Stack',
            props: { gap: 6 },
            children: {
              for: '$.people',
              as: 'person',
              key: 'id',
              do: {
                component: 'Button',
                props: { variant: 'outline', full: true, value: '$.person' },
                ref: 'as',
                children: {
                  component: 'Row',
                  props: { gap: 10, align: 'center', justify: 'between', grow: true },
                  children: [
                    {
                      component: 'Row',
                      props: { gap: 10, align: 'center' },
                      children: [
                        { component: 'Avatar', props: { name: '$.person.name', size: 26 } },
                        { component: 'Text', props: { size: 'sm', weight: 'medium' }, children: '$.person.name' },
                      ],
                    },
                    { component: 'Text', props: { size: 'xs', color: 'faint' }, children: '{{$.person.role}} · {{$.person.studio}}' },
                  ],
                },
              },
            },
          },
        ],
      },
      else: '',
    },
  ],
};
