import type { LayoutNode } from '@niscorp/nova';

export const assistantLayout: LayoutNode = {
  component: 'Dock',
  props: { open: '$.open' },
  children: [
    { component: 'AssistState', props: { scope: '$.profile.scope', thinking: '$.thinking' } },
    {
      if: '$.open',
      then: {
        component: 'Stack',
        props: { gap: 0, h: '100%', shrink: true },
        children: [
          {
            component: 'Row',
            props: { justify: 'between', align: 'center', px: 14, py: 10 },
            children: [
              {
                component: 'Row',
                props: { gap: 8, align: 'center' },
                children: [
                  { component: 'Icon', props: { name: 'sparkle', size: 16, color: 'accent' } },
                  { component: 'Text', props: { weight: 620 }, children: 'Assistant' },
                ],
              },
              { component: 'Button', ref: 'close', props: { variant: 'plain' }, children: 'Close' },
            ],
          },
          { component: 'Rule', props: {} },
          {
            component: 'Box',
            props: {
              grow: true,
              scroll: true,
              stickBottom: true,
              shrink: true,
              px: 14,
              py: 12,
              h: 320,
            },
            children: {
              component: 'Stack',
              props: { gap: 10 },
              children: [
                {
                  if: '$.turns.length',
                  then: {
                    for: '$.turns',
                    as: 't',
                    key: 'turn_id',
                    do: {
                      component: 'Bubble',
                      props: {
                        mine: { $if: { $eq: ['$t.role', 'user'] }, $then: true, $else: false },
                        stamp: '$t.at_display',
                      },
                      children: '$t.body',
                    },
                  },
                  else: {
                    component: 'Text',
                    props: { size: 'sm', color: 'mute' },
                    children:
                      'Ask for anything. What can be done from here, I will do; what cannot, I will say.',
                  },
                },
                {
                  if: '$.pending',
                  then: { component: 'Bubble', props: { mine: true }, children: '$.pending' },
                  else: '',
                },
                {
                  if: '$.thinking',
                  then: {
                    component: 'Row',
                    props: { gap: 8, align: 'center' },
                    children: [
                      { component: 'Spinner', props: { size: 14 } },
                      {
                        component: 'Text',
                        props: { size: 'sm', color: 'mute' },
                        children: 'Thinking… {{$.seconds}}s',
                      },
                    ],
                  },
                  else: '',
                },
              ],
            },
          },
          { component: 'Rule', props: {} },
          {
            component: 'Row',
            props: { gap: 8, px: 12, py: 10 },
            children: [
              {
                component: 'Box',
                props: { grow: true },
                children: {
                  component: 'Input',
                  ref: 'draft',
                  model: '$.draft',
                  props: { placeholder: 'Ask…', submitRef: 'send' },
                },
              },
              {
                component: 'Button',
                ref: 'send',
                props: { icon: 'send', disabled: '$.thinking' },
                children: '',
              },
            ],
          },
        ],
      },
      else: {
        if: '$.thinking',
        then: {
          component: 'Row',
          props: { gap: 8, align: 'center' },
          children: [
            { component: 'Spinner', props: { size: 14 } },
            {
              component: 'Button',
              ref: 'open',
              props: { icon: 'sparkle', variant: 'ink' },
              children: 'Thinking… {{$.seconds}}s',
            },
          ],
        },
        else: {
          component: 'Row',
          props: { gap: 8, align: 'center' },
          children: [
            {
              if: '$.profile.watched',
              then: {
                component: 'Button',
                ref: 'nudge',
                props: { icon: 'sparkle', variant: 'ink' },
                children: 'Help with this',
              },
              else: '',
            },
            {
              component: 'Button',
              ref: 'open',
              props: { icon: 'sparkle', variant: 'ink' },
              children: 'Ask',
            },
          ],
        },
      },
    },
  ],
};
