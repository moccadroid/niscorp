import type { LayoutNode } from '@niscorp/nova';

// What the desk knows about a guest, and how it gets written down.
//
// The oldest artefact in hotel-keeping and the one thing every front office
// actually runs on. It is staff-only by charter rather than by a flag, so there
// is no "visible to guest" switch anywhere on this card and there never will be:
// a note reading "difficult, watch the bill" cannot resolve onto the shell of
// the person it is about because their role does not name the table.
export const noteLayout: LayoutNode = {
  if: '$.stayId',
  then: {
    component: 'Stack',
    props: { gap: 14 },
    children: [
      {
        if: '$.notes.length',
        then: {
          component: 'Stack',
          props: { gap: 8 },
          children: {
            for: '$.notes',
            as: 'n',
            key: 'note_id',
            do: {
              component: 'Card',
              children: {
                component: 'Stack',
                props: { gap: 3 },
                children: [
                  {
                    component: 'Row',
                    props: { justify: 'between', align: 'center' },
                    children: [
                      { component: 'Text', props: { size: 'sm' }, children: '$n.body' },
                      { component: 'Badge', props: { tone: 'neutral' }, children: '$n.kind' },
                    ],
                  },
                  { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '{{$n.author}} · {{$n.created_display}}' },
                ],
              },
            },
          },
        },
        else: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Nothing written down about this guest yet.' },
      },
      { component: 'Rule', props: { label: 'Add one' } },
      {
        component: 'Row',
        props: { gap: 8 },
        children: [
          { component: 'Button', ref: 'kind', props: { value: 'preference', variant: { $if: { $eq: ['$.kind', 'preference'] }, $then: 'solid', $else: 'quiet' } }, children: 'Preference' },
          { component: 'Button', ref: 'kind', props: { value: 'note', variant: { $if: { $eq: ['$.kind', 'note'] }, $then: 'solid', $else: 'quiet' } }, children: 'Note' },
          { component: 'Button', ref: 'kind', props: { value: 'watch', variant: { $if: { $eq: ['$.kind', 'watch'] }, $then: 'solid', $else: 'quiet' } }, children: 'Watch' },
        ],
      },
      {
        component: 'Textarea',
        ref: 'body',
        model: '$.body',
        props: { placeholder: 'Wants a high floor. Celebrating an anniversary. Do not offer an upgrade — complained about the last one.', rows: 3 },
      },
      { if: '$.drafted', then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Drafted for you. Change anything you like before it is saved.' }, else: '' },
      {
        component: 'Button',
        ref: 'save',
        props: { icon: 'check', disabled: { $if: '$.body', $then: '$.working', $else: true } },
        children: 'Write it down',
      },
    ],
  },
  else: { component: 'Empty', props: { icon: 'chat', title: 'No guest in hand', hint: 'Open a guest and this is where what you learn about them goes.' } },
};
