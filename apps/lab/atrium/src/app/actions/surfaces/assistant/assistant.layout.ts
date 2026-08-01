import type { LayoutNode } from '@niscorp/nova';

// The assistant's window: a pill in thumb reach, expanding into the
// conversation. Mobile-first — the panel takes the width on a phone; a wide
// screen anchors it bottom-right (the Dock's CSS, not a second layout).
//
// The dock renders the CONVERSATION alone. What the watcher does — cards
// placed, cards closed — happens on the shell itself and is recorded in the
// admin timeline, never here.
export const assistantLayout: LayoutNode = {
  component: 'Dock',
  props: { open: '$.open' },
  children: [
    // The territory frame's one input (see ui/components/assist.tsx). It rides
    // this layout because the dock is the always-mounted surface that already
    // holds both facts: the profile it loads, the thinking the runs write.
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
                    // Two kinds of line, and no third: what the user said and
                    // what the agent answered. `assistant/turns` is chat rows
                    // alone — the watcher's record never renders here.
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
      // COLLAPSED IS THE NORMAL STATE, so this is where the working indicator has
      // to live. It used to be only inside the open panel, which meant an ambient
      // run — the one nobody asked for and therefore the one that most needs
      // announcing — showed nothing at all: a card simply appeared on the screen
      // a while later. The pill says it is thinking and for how long, so a person
      // can tell the difference between "considering your screen" and "hung".
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
        // Two ways in, side by side. `Ask` opens the panel to type a question
        // at the CHAT agent. `Help with this` wakes the WATCHER against the
        // screen as it stands, and is hidden when nobody watches this person.
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
