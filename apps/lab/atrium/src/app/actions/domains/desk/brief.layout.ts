import type { LayoutNode } from '@niscorp/nova';

export const briefLayout: LayoutNode = {
  if: '$.stayId',
  then: {
    component: 'Stack',
    props: { gap: 14 },
    children: [
      {
        component: 'Row',
        props: { justify: 'between', align: 'center' },
        children: [
          {
            component: 'Stack',
            props: { gap: 2 },
            children: [
              { component: 'Text', props: { weight: 600, size: 'lg' }, children: '{{$.guest.name}}' },
              { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Room {{$.stay.room_number}} · {{$.stay.state_text}} · {{$.stay.arrival_display}} to {{$.stay.departure_display}}' },
            ],
          },
          { if: { $neq: ['$.guest.tier', 'none'] }, then: { component: 'Badge', props: { tone: 'accent' }, children: '$.guest.tier' }, else: '' },
        ],
      },

      {
        if: '$.reading',
        then: {
          component: 'Notice',
          props: { tone: 'accent', icon: 'sparkle' },
          children: '$.reading',
        },
        else: '',
      },

      { component: 'Rule', props: { label: 'What the house knows' } },
      {
        component: 'Grid',
        props: { min: 140, gap: 10 },
        children: [
          {
            component: 'Stat',
            props: {
              label: 'Stays before',
              value: { $if: '$.visits.count', $then: '{{$.visits.count}}', $else: 'First time' },
              hint: { $if: '$.visits.count', $then: 'Not a stranger.', $else: 'Nobody here has met them.' },
            },
          },
          { component: 'Stat', props: { label: 'On the bill', value: '{{$.total.total_display}}', hint: 'This stay so far.' } },
          { component: 'Stat', props: { label: 'Speaks', value: '{{$.guest.language_display}}', hint: 'From their profile.' } },
          {
            component: 'Stat',
            props: {
              label: 'Open faults',
              value: { $if: '$.issues.length', $then: '{{$.issues.length}}', $else: 'None' },
              hint: { $if: '$.issues.length', $then: '{{$.issues.0.summary}}', $else: 'Nothing reported.' },
            },
          },
        ],
      },

      {
        if: '$.notes.length',
        then: {
          component: 'Stack',
          props: { gap: 8 },
          children: [
            { component: 'Rule', props: { label: 'Notes' } },
            {
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
                      { component: 'Text', props: { size: 'sm' }, children: '$n.body' },
                      { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '{{$n.author}} · {{$n.created_display}}' },
                    ],
                  },
                },
              },
            },
          ],
        },
        else: '',
      },

      {
        if: { $or: ['$.transfers.length', '$.given.length'] },
        then: {
          component: 'Stack',
          props: { gap: 8 },
          children: [
            { component: 'Rule', props: { label: 'Already arranged' } },
            {
              if: '$.transfers.length',
              then: {
                component: 'Stack',
                props: { gap: 4 },
                children: {
                  for: '$.transfers',
                  as: 't',
                  key: 'transfer_id',
                  do: { component: 'Text', props: { size: 'sm' }, children: 'Car at {{$t.pickup_at}} on {{$t.pickup_on}} to {{$t.destination}}' },
                },
              },
              else: '',
            },
            {
              if: '$.given.length',
              then: {
                component: 'Stack',
                props: { gap: 4 },
                children: {
                  for: '$.given',
                  as: 'g',
                  key: 'line_id',
                  do: { component: 'Text', props: { size: 'sm' }, children: '{{$g.description}} ({{$g.amount_display}}) · {{$g.posted_display}}' },
                },
              },
              else: '',
            },
          ],
        },
        else: '',
      },
    ],
  },
  else: { component: 'Empty', props: { icon: 'sparkle', title: 'No guest in hand', hint: 'Open a guest and this says who they are.' } },
};
