import type { LayoutNode } from '@niscorp/nova';

export const messageLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 14, h: '100%' },
  children: [
    {
      if: '$.loading',
      then: { component: 'Skeleton', props: { h: 46, count: 3 } },
      else: {
        if: '$.thread.length',
        then: {
          component: 'Box',
          props: { scroll: true, stickBottom: true, h: 300 },
          children: {
            component: 'Stack',
            props: { gap: 12 },
            children: {
              for: '$.thread',
              as: 'm',
              key: 'message_id',
              do: {
                component: 'Bubble',
                // The assistant is a third voice: it speaks FOR the guest, so it
                // sits on the guest's side, captioned — never impersonating.
                props: {
                  mine: { $if: { $eq: ['$m.sender', 'desk'] }, $then: false, $else: true },
                  label: { $if: { $eq: ['$m.sender', 'assistant'] }, $then: 'Your assistant', $else: '' },
                  stamp: '$m.sent_display',
                },
                children: '$m.body',
              },
            },
          },
        },
        else: { component: 'Empty', props: { icon: 'chat', title: 'Nothing yet', hint: 'Someone is at the desk around the clock.' } },
      },
    },
    {
      component: 'Row',
      props: { gap: 8 },
      children: [
        { component: 'Box', props: { grow: true }, children: { component: 'Input', ref: 'draft', model: '$.draft', props: { placeholder: 'Write to the desk…', big: true, submitRef: 'send' } } },
        { component: 'Button', ref: 'send', props: { icon: 'send' }, children: 'Send' },
      ],
    },
  ],
};
