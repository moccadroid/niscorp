import type { LayoutNode } from '@niscorp/nova';

// Sending a guest's ask to the floor.
//
// The shape is the issue board's dispatch controls, deliberately: a clerk who
// has sent one fault to maintenance already knows this form. What differs is
// that the job has to be WRITTEN here — a fault arrives with a summary somebody
// typed, an ask arrives as a sentence in a conversation, and the person who
// picks it up on the floor only ever sees what goes in this box.
export const requestLayout: LayoutNode = {
  if: '$.loading',
  then: { component: 'Skeleton', props: { h: 64, count: 3 } },
  else: {
    component: 'Stack',
    props: { gap: 14 },
    children: [
      { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.stay.guest_name}} · Room {{$.stay.room_number}}' },
      {
        if: '$.done',
        then: { component: 'Empty', props: { icon: 'check', title: 'Sent to the floor', hint: 'It is on their list now.' } },
        else: {
          component: 'Stack',
          props: { gap: 14 },
          children: [
            { component: 'Rule', props: { label: 'What they asked for' } },
            { component: 'Input', ref: 'title', model: '$.title', props: { placeholder: 'Two extra pillows' } },
            { component: 'Rule', props: { label: 'What the person needs to know' } },
            {
              component: 'Textarea',
              ref: 'detail',
              model: '$.detail',
              props: { placeholder: 'When it has to happen, which room, and what the guest actually said — so nobody has to come back and ask.', rows: 3 },
            },
            {
              if: '$.drafted',
              then: { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Drafted for you. Change anything you like before it goes.' },
              else: '',
            },
            {
              component: 'Tabs',
              ref: 'kind',
              props: {
                value: '$.kind',
                options: [
                  { value: 'housekeeping', label: 'Housekeeping' },
                  { value: 'maintenance', label: 'Maintenance' },
                  { value: 'front office', label: 'Front office' },
                ],
              },
            },
            {
              component: 'Row',
              props: { gap: 6, wrap: true },
              children: {
                for: '$.staff',
                as: 'p',
                key: 'staff_id',
                do: {
                  component: 'Button',
                  ref: 'assignee',
                  props: { variant: { $if: { $eq: ['$p.staff_id', '$.assigneeId'] }, $then: 'solid', $else: 'quiet' }, value: '$p.staff_id' },
                  children: '$p.name',
                },
              },
            },
            {
              component: 'Button',
              ref: 'send',
              props: { big: true, icon: 'wrench', disabled: { $if: '$.title', $then: '$.working', $else: true } },
              children: { if: '$.title', then: 'Send it to the floor', else: 'Say what they asked for' },
            },
          ],
        },
      },
    ],
  },
};
