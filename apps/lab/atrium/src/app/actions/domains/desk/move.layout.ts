import type { LayoutNode } from '@niscorp/nova';

// Moving a guest into a different room.
//
// The candidates are rooms that are INSPECTED and not already spoken for, which
// is a stricter test than "vacant" and the right one: a clerk cannot give
// somebody a room housekeeping has not signed off, and a room held for an
// arrival at half four is not free at four o'clock however empty it looks.
export const moveLayout: LayoutNode = {
  if: '$.done',
  then: {
    component: 'Stack',
    props: { gap: 10, align: 'center' },
    children: [
      { component: 'Icon', props: { name: 'check', size: 24, color: 'accent' } },
      { component: 'Text', props: { weight: 600 }, children: 'Moved to {{$.chosen.number_display}}' },
      { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: 'The old room is down for turning and the guest has been told.' },
    ],
  },
  else: {
    if: '$.stayId',
    then: {
      component: 'Stack',
      props: { gap: 14 },
      children: [
        {
          component: 'Text',
          props: { size: 'sm', color: 'mute' },
          children: '{{$.stay.guest_name}} is in {{$.stay.room_number}} — {{$.stay.room_kind}}.',
        },
        {
          component: 'Row',
          props: { gap: 8 },
          children: [
            { component: 'Button', ref: 'same-class', props: { variant: { $if: { $neq: ['$.kindFilter', '%'] }, $then: 'solid', $else: 'quiet' } }, children: 'Same class or nothing' },
            { component: 'Button', ref: 'any-class', props: { variant: { $if: { $eq: ['$.kindFilter', '%'] }, $then: 'solid', $else: 'quiet' } }, children: 'Anything free' },
          ],
        },
        {
          if: '$.loading',
          then: { component: 'Skeleton', props: { h: 48, count: 3 } },
          else: {
            if: '$.rooms.length',
            then: {
              component: 'Grid',
              props: { min: 150, gap: 8 },
              children: {
                for: '$.rooms',
                as: 'r',
                key: 'room_id',
                do: {
                  component: 'Tile',
                  ref: 'pick-room',
                  props: {
                    title: '$r.number_display',
                    blurb: '$r.where',
                    icon: 'bed',
                    value: '$r',
                    active: { $if: { $eq: ['$r.room_id', '$.chosen.room_id'] }, $then: true, $else: false },
                  },
                },
              },
            },
            else: {
              component: 'Empty',
              props: {
                icon: 'bed',
                title: 'Nothing ready to move them into',
                hint: 'Every sellable room is taken or still to be turned. The room board says which.',
              },
            },
          },
        },
        {
          if: '$.chosen.room_id',
          then: {
            component: 'Stack',
            props: { gap: 10 },
            children: [
              { component: 'Rule', props: { label: 'Why, for the record' } },
              { component: 'Input', ref: 'reason', model: '$.reason', props: { placeholder: 'Air conditioning fault — second night.' } },
              { component: 'Rule', props: { label: 'What you say to them' } },
              { component: 'Textarea', ref: 'tell', model: '$.tell', props: { placeholder: 'A line to the guest — where they are moving to, and why.', rows: 3 } },
              { if: '$.drafted', then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Drafted for you. Change anything you like before it goes.' }, else: '' },
              {
                component: 'Button',
                ref: 'move',
                props: { big: true, icon: 'door', disabled: { $if: '$.tell', $then: '$.working', $else: true } },
                children: { if: '$.tell', then: 'Move them to {{$.chosen.number_display}}', else: 'Write them a line first' },
              },
              {
                component: 'Text',
                props: { size: 'sm', color: 'mute' },
                children: 'The stay moves, the old room goes down for turning, housekeeping gets the new one, and the guest is told — one press.',
              },
            ],
          },
          else: '',
        },
      ],
    },
    else: { component: 'Empty', props: { icon: 'door', title: 'No guest in hand', hint: 'Open a guest and this moves them.' } },
  },
};
