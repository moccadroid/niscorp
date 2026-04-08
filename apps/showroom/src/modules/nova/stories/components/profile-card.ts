import type { LayoutStory } from '../../story-types';

export const profileCardStory: LayoutStory = {
  id: 'profile-card',
  name: 'Profile card (dogfood)',
  description:
    'A composite profile card using all five primitives: Box, Stack, Text, Button, Input.',
  kind: 'layout',
  category: 'Components',
  layout: {
    component: 'Box',
    props: { padding: 24, background: '#ffffff', radius: 12, border: true },
    children: {
      component: 'Stack',
      props: { direction: 'column', gap: 16 },
      children: [
        {
          component: 'Stack',
          props: { direction: 'row', gap: 16, align: 'center' },
          children: [
            {
              component: 'Box',
              props: {
                padding: 24,
                background: '#dbeafe',
                radius: 999,
              },
              children: { component: 'Text', props: { weight: 'bold' }, children: 'AL' },
            },
            {
              component: 'Stack',
              props: { direction: 'column', gap: 2 },
              children: [
                {
                  component: 'Text',
                  props: { size: 'xl', weight: 'bold' },
                  children: '{{$.user.name}}',
                },
                {
                  component: 'Text',
                  props: { size: 'sm', color: '#6b7280' },
                  children: '{{$.user.title}}',
                },
              ],
            },
          ],
        },
        {
          component: 'Text',
          props: { size: 'md' },
          children: '{{$.user.bio}}',
        },
        {
          component: 'Stack',
          props: { direction: 'row', gap: 8 },
          children: [
            { component: 'Button', props: { variant: 'primary' }, children: 'Follow' },
            { component: 'Button', props: { variant: 'secondary' }, children: 'Message' },
          ],
        },
        {
          component: 'Input',
          props: { placeholder: 'Add a note', value: '' },
        },
      ],
    },
  },
  data: {
    user: {
      name: 'Ada Lovelace',
      title: 'Mathematician',
      bio: 'Pioneer of computing.',
    },
  },
  expected: {
    textIncludes: [
      'Ada Lovelace',
      'Mathematician',
      'Pioneer of computing.',
      'Follow',
      'Message',
    ],
  },
};
