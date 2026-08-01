import type { LayoutNode } from '@niscorp/nova';

// Handing something to a named human.
//
// It writes a task, and using a task rather than inventing a channel is the
// whole design: a task already means "somebody must do this", already carries an
// assignee and a status, and is already read by the surfaces that show work. The
// only thing it was missing was room for a sentence, which is one column.
//
// The receiving end is the stall list — an escalation nobody can see is a
// message thrown over a wall.
export const escalateLayout: LayoutNode = {
  if: '$.done',
  then: {
    component: 'Stack',
    props: { gap: 10, align: 'center' },
    children: [
      { component: 'Icon', props: { name: 'check', size: 24, color: 'accent' } },
      { component: 'Text', props: { weight: 600 }, children: 'Handed to {{$.assigneeName}}' },
      { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: 'It is on the list until they pick it up.' },
    ],
  },
  else: {
    component: 'Stack',
    props: { gap: 14 },
    children: [
      { component: 'Rule', props: { label: 'Who takes it' } },
      {
        if: '$.staff.length',
        then: {
          component: 'Grid',
          props: { min: 150, gap: 8 },
          children: {
            for: '$.staff',
            as: 's',
            key: 'staff_id',
            do: {
              component: 'Tile',
              ref: 'pick-person',
              props: {
                title: '$s.name',
                blurb: '$s.job',
                icon: 'dot',
                value: '$s',
                active: { $if: { $eq: ['$s.staff_id', '$.assigneeId'] }, $then: true, $else: false },
              },
            },
          },
        },
        else: { component: 'Skeleton', props: { h: 48, count: 2 } },
      },
      { component: 'Rule', props: { label: 'What it is' } },
      { component: 'Input', ref: 'title', model: '$.title', props: { placeholder: 'Room 412 — third fault, guest asking for a manager' } },
      { component: 'Rule', props: { label: 'What they need to know' } },
      {
        component: 'Textarea',
        ref: 'detail',
        model: '$.detail',
        props: { placeholder: 'The whole story, so they do not have to come back and ask: what happened, what has been tried, and what the guest has been told.', rows: 4 },
      },
      { if: '$.drafted', then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Drafted for you. Change anything you like before it goes.' }, else: '' },
      {
        component: 'Button',
        ref: 'hand',
        props: { big: true, icon: 'alert', disabled: { $if: '$.assigneeId', $then: { $if: '$.title', $then: '$.working', $else: true }, $else: true } },
        children: { if: '$.assigneeId', then: { if: '$.title', then: 'Hand it to {{$.assigneeName}}', else: 'Say what it is' }, else: 'Pick somebody' },
      },
    ],
  },
};
