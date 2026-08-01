import type { LayoutNode } from '@niscorp/nova';

// Putting something right. The single most sensitive surface in the app, and the
// design of it is one sentence: THE MACHINE PICKS FROM A MENU AND WRITES THE
// WORDS; THE PRICE AND THE PRESS ARE BOTH HUMAN.
//
// The gestures are connector catalogue rows — label, description and value all
// shipped and priced by somebody who is allowed to price things. Nothing here,
// and nothing an assistant returns, can produce an amount that is not on one of
// those rows. So the worst a bad suggestion can do is offer the wrong gesture
// from a list the hotel wrote, at a price the hotel set, to a clerk who has to
// press the button.
//
// What the assistant is genuinely good at is the other half: knowing that this
// is the guest with two nights of a rattling air conditioner and a note saying
// she reported the same fault last time, and writing the apology that says so.
export const goodwillLayout: LayoutNode = {
  if: '$.done',
  then: {
    component: 'Stack',
    props: { gap: 10, align: 'center' },
    children: [
      { component: 'Icon', props: { name: 'check', size: 24, color: 'accent' } },
      { component: 'Text', props: { weight: 600 }, children: '{{$.chosen.label}} — done' },
      { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: 'It is on the bill as a credit and the note has gone to the guest.' },
    ],
  },
  else: {
    if: '$.stayId',
    then: {
      component: 'Stack',
      props: { gap: 14 },
      children: [
        {
          if: '$.given.length',
          then: {
            component: 'Notice',
            props: { tone: 'warn', icon: 'receipt' },
            children: 'Already given on this stay: {{$.given.0.description}} ({{$.given.0.amount_display}}). Worth knowing before another.',
          },
          else: '',
        },
        {
          if: '$.loading',
          then: { component: 'Skeleton', props: { h: 56, count: 3 } },
          else: {
            if: '$.gestures.length',
            then: {
              component: 'Stack',
              props: { gap: 8 },
              children: {
                for: '$.gestures',
                as: 'g',
                key: 'option_id',
                do: {
                  component: 'Tile',
                  ref: 'pick-gesture',
                  props: {
                    title: '$g.label',
                    blurb: '$g.price_line',
                    icon: '$g.icon',
                    value: '$g',
                    active: { $if: { $eq: ['$g.option_id', '$.chosen.option_id'] }, $then: true, $else: false },
                  },
                },
              },
            },
            else: { component: 'Empty', props: { icon: 'sparkle', title: 'No gestures published', hint: 'This hotel has not priced any goodwill.' } },
          },
        },
        {
          if: '$.chosen.option_id',
          then: {
            component: 'Stack',
            props: { gap: 10 },
            children: [
              { component: 'Rule', props: { label: 'What you say to them' } },
              {
                component: 'Textarea',
                ref: 'note',
                model: '$.note',
                props: { placeholder: 'In your own words — what went wrong, and what you have done about it.', rows: 3 },
              },
              {
                if: '$.drafted',
                then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Drafted for you. Change anything you like before it goes.' },
                else: '',
              },
              { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', icon: 'alert' }, children: '$.error' }, else: '' },
              {
                component: 'Button',
                ref: 'give',
                props: { big: true, icon: 'sparkle', disabled: { $if: '$.note', $then: '$.working', $else: true } },
                children: { if: '$.note', then: 'Credit {{$.chosen.amount_display}} and send', else: 'Write them a line first' },
              },
              { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'The credit goes on the folio and the note goes to the guest, in one press.' },
            ],
          },
          else: '',
        },
      ],
    },
    else: { component: 'Empty', props: { icon: 'sparkle', title: 'No guest in hand', hint: 'Open a guest and this puts something right for them.' } },
  },
};
