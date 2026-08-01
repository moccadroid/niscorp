import type { LayoutNode } from '@niscorp/nova';

// The shift note.
//
// Every hotel writes one and almost none of them write it in the hotel's own
// software — it lives on paper, or in a group chat, which is why the thing the
// night porter needed to know is the thing nobody told them. Putting it beside
// the shift it describes is most of the value; drafting it from what actually
// moved is the rest.
export const handoverLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 18, maxWidth: 760 },
  children: [
    {
      if: '$.saved',
      then: { component: 'Notice', props: { tone: 'good', icon: 'check' }, children: 'Left for the next shift.' },
      else: {
        component: 'Stack',
        props: { gap: 10 },
        children: [
          { component: 'Rule', props: { label: 'Leave a note for the next shift' } },
          {
            component: 'Row',
            props: { gap: 8 },
            children: [
              { component: 'Button', ref: 'shift', props: { value: 'day', variant: { $if: { $eq: ['$.shift', 'day'] }, $then: 'solid', $else: 'quiet' } }, children: 'Day' },
              { component: 'Button', ref: 'shift', props: { value: 'evening', variant: { $if: { $eq: ['$.shift', 'evening'] }, $then: 'solid', $else: 'quiet' } }, children: 'Evening' },
              { component: 'Button', ref: 'shift', props: { value: 'night', variant: { $if: { $eq: ['$.shift', 'night'] }, $then: 'solid', $else: 'quiet' } }, children: 'Night' },
            ],
          },
          {
            component: 'Textarea',
            ref: 'body',
            model: '$.body',
            props: { placeholder: 'What is still open, who is unhappy, what you promised somebody, and what the next shift will walk into.', rows: 8 },
          },
          { if: '$.drafted', then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Drafted from what moved on this shift. Change anything you like before it goes.' }, else: '' },
          {
            component: 'Button',
            ref: 'save',
            props: { big: true, icon: 'chat', disabled: { $if: '$.body', $then: '$.working', $else: true } },
            children: 'Leave it for them',
          },
        ],
      },
    },
    {
      if: '$.notes.length',
      then: {
        component: 'Stack',
        props: { gap: 10 },
        children: [
          { component: 'Rule', props: { label: 'Earlier' } },
          {
            component: 'Stack',
            props: { gap: 10 },
            children: {
              for: '$.notes',
              as: 'h',
              key: 'handover_id',
              do: {
                component: 'Card',
                children: {
                  component: 'Stack',
                  props: { gap: 6 },
                  children: [
                    {
                      component: 'Row',
                      props: { justify: 'between', align: 'center' },
                      children: [
                        { component: 'Text', props: { weight: 'medium' }, children: '{{$h.author_name}} · {{$h.shift}}' },
                        { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '$h.created_display' },
                      ],
                    },
                    { component: 'Text', props: { size: 'sm' }, children: '$h.body' },
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
