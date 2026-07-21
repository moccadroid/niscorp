import type { LayoutNode } from '@niscorp/nova';

// The sign-in surface — the anonymous principal's ENTIRE application. Two
// stages driven by `$.stage`: 'user' (enter a username, send the link) and
// 'sent' (the fake magic link, standing in for the email — real magic-link
// auth replaces the auth fns, not this layout).
const form: LayoutNode = {
  component: 'Stack',
  props: { gap: 13 },
  children: [
    { component: 'Input', model: '$.username', ref: 'username', props: { label: 'Username', placeholder: 'alex, jordan or sam' } },
    // errorTarget stores the endpoint's { status, message, data } — render the
    // message, not the object (String(object) is "[object Object]" everywhere).
    { if: '$.error', then: { component: 'Text', props: { size: 'sm', color: 'secondary' }, children: '{{$.error.message}}' } },
    { component: 'Button', ref: 'send', props: { variant: 'primary' }, children: 'Send magic link' },
  ],
};

const sent: LayoutNode = {
  component: 'Stack',
  props: { gap: 13 },
  children: [
    {
      component: 'Text',
      props: { size: 'sm', color: 'secondary' },
      children: 'Magic link sent to {{$.username}}@relay.app. The email is faked — the link is right here:',
    },
    { component: 'Button', ref: 'open-link', props: { variant: 'primary' }, children: 'Open magic link' },
    { component: 'Button', ref: 'back', props: { variant: 'ghost', size: 'sm' }, children: 'Use a different name' },
  ],
};

export const loginLayout: LayoutNode = {
  component: 'Box',
  props: { h: '100%', center: true },
  children: {
    component: 'Stack',
    props: { gap: 16, width: 320 },
    children: [
      {
        component: 'Row',
        props: { gap: 10, align: 'center' },
        children: [
          { component: 'Box', props: { bg: 'brand', glow: true, radius: 7, width: 28, h: 28, center: true }, children: { component: 'Icon', props: { name: 'zap', size: 15 } } },
          { component: 'Text', props: { size: 'md', weight: 680 }, children: 'Sign in to Relay' },
        ],
      },
      { if: { $eq: ['$.stage', 'sent'] }, then: sent, else: form },
    ],
  },
};
