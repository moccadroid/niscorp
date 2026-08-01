import type { LayoutNode } from '@niscorp/nova';

// Mews' half of `transfer.book`, and its half of `goodwill.grant`.
//
// These are deliberately NOT imported from the Opera bundle. Two vendors
// implementing one capability each ship their own surfaces, against their own
// service, on their own deployment clock — that is the thing the app is claiming,
// and a shared file between two integrations would quietly make it false. The
// duplication is the boundary.

const routes: LayoutNode = {
  if: '$.loading',
  then: { component: 'Skeleton', props: { h: 56, count: 3 } },
  else: {
    if: '$.routes.length',
    then: {
      component: 'Stack',
      props: { gap: 8 },
      children: {
        for: '$.routes',
        as: 'r',
        key: 'option_id',
        do: {
          component: 'Tile',
          ref: 'pick-route',
          props: {
            title: '$r.label',
            blurb: '$r.price_line',
            icon: '$r.icon',
            value: '$r',
            active: { $if: { $eq: ['$r.option_id', '$.chosen.option_id'] }, $then: true, $else: false },
          },
        },
      },
    },
    else: { component: 'Empty', props: { icon: 'door', title: 'No routes offered', hint: 'This hotel has not published any transfer routes.' } },
  },
};

const timeField: LayoutNode = {
  component: 'Stack',
  props: { gap: 8 },
  children: [
    { component: 'Rule', props: { label: 'Pickup time' } },
    { component: 'Input', ref: 'time', model: '$.pickupAt', props: { placeholder: '07:30' } },
    { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Twenty-four hour. The airport is twenty minutes at that hour, an hour in August.' },
  ],
};

const booked: LayoutNode = {
  if: '$.transfers.length',
  then: {
    component: 'Stack',
    props: { gap: 8 },
    children: [
      { component: 'Rule', props: { label: 'Booked' } },
      {
        component: 'Stack',
        props: { gap: 8 },
        children: {
          for: '$.transfers',
          as: 't',
          key: 'transfer_id',
          do: {
            component: 'Card',
            children: {
              component: 'Row',
              props: { justify: 'between', align: 'center' },
              children: [
                {
                  component: 'Stack',
                  props: { gap: 2 },
                  children: [
                    { component: 'Text', props: { weight: 'medium' }, children: '{{$t.pickup_at}} · {{$t.pickup_on}}' },
                    { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$t.destination}} · {{$t.vehicle}} · {{$t.confirmation}}' },
                  ],
                },
                {
                  if: { $eq: ['$t.status', 'booked'] },
                  then: { component: 'Button', ref: 'cancel', props: { variant: 'quiet', value: '$t' }, children: 'Cancel' },
                  else: { component: 'Badge', props: { tone: '$t.status_tone' }, children: '$t.status' },
                },
              ],
            },
          },
        },
      },
    ],
  },
  else: '',
};

export const transferLayout: LayoutNode = {
  if: '$.done',
  then: {
    component: 'Stack',
    props: { gap: 10, align: 'center' },
    children: [
      { component: 'Icon', props: { name: 'check', size: 24, color: 'accent' } },
      { component: 'Text', props: { weight: 600 }, children: 'El coche está reservado' },
      { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: '{{$.booked.at}} · {{$.booked.destination}} — {{$.booked.driver}}. Reference {{$.booked.confirmation}}.' },
      { component: 'Button', ref: 'again', props: { variant: 'quiet' }, children: 'Book another' },
    ],
  },
  else: {
    component: 'Stack',
    props: { gap: 16 },
    children: [
      booked,
      { component: 'Rule', props: { label: 'Book a car' } },
      routes,
      timeField,
      { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', icon: 'alert' }, children: '$.error' }, else: '' },
      {
        component: 'Button',
        ref: 'book',
        props: { big: true, icon: 'door', disabled: { $if: '$.chosen.option_id', $then: { $if: '$.pickupAt', $then: '$.working', $else: true }, $else: true } },
        children: { if: '$.chosen.option_id', then: { if: '$.pickupAt', then: 'Book for {{$.pickupAt}}', else: 'Give a pickup time' }, else: 'Pick a route' },
      },
    ],
  },
};

export const bookTransferLayout: LayoutNode = {
  if: '$.done',
  then: {
    component: 'Stack',
    props: { gap: 10, align: 'center' },
    children: [
      { component: 'Icon', props: { name: 'check', size: 24, color: 'accent' } },
      { component: 'Text', props: { weight: 600 }, children: 'Car booked' },
      { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: '{{$.booked.at}} · {{$.booked.destination}} · {{$.booked.confirmation}}' },
    ],
  },
  else: {
    if: '$.stayId',
    then: {
      component: 'Stack',
      props: { gap: 12 },
      children: [
        { component: 'Text', props: { size: 'sm', color: 'mute' }, children: { if: '$.stayLabel', then: 'A car for {{$.stayLabel}}.', else: 'A car for this guest.' } },
        booked,
        routes,
        timeField,
        { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', icon: 'alert' }, children: '$.error' }, else: '' },
        {
          component: 'Button',
          ref: 'book',
          props: { big: true, icon: 'door', disabled: { $if: '$.chosen.option_id', $then: { $if: '$.pickupAt', $then: '$.working', $else: true }, $else: true } },
          children: { if: '$.pickupAt', then: 'Book for {{$.pickupAt}}', else: 'Route and time' },
        },
      ],
    },
    else: { component: 'Empty', props: { icon: 'door', title: 'No guest in hand', hint: 'Open a guest and this books their car.' } },
  },
};

export const transferSheetLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16, maxWidth: 900 },
  children: [
    {
      component: 'Rows',
      props: {
        rows: '$.cars',
        loading: '$.loading',
        rowKey: 'transfer_id',
        empty: 'No cars booked.',
        columns: [
          { label: 'Pickup', w: 'auto', cell: { kind: 'primary', key: 'pickup_at', subKey: 'pickup_on' } },
          { label: 'Guest', w: 1, cell: { kind: 'primary', key: 'guest_name', subKey: 'room_number' } },
          { label: 'To', w: 1, cell: { kind: 'primary', key: 'destination', subKey: 'vehicle' } },
          { label: '', w: 'auto', cell: { kind: 'action', ref: 'open-guest', label: 'Open' } },
        ],
      },
    },
  ],
};

// ─── goodwill ────────────────────────────────────────────────
export const goodwillLayout: LayoutNode = {
  if: '$.done',
  then: {
    component: 'Stack',
    props: { gap: 10, align: 'center' },
    children: [
      { component: 'Icon', props: { name: 'check', size: 24, color: 'accent' } },
      { component: 'Text', props: { weight: 600 }, children: '{{$.chosen.label}} — done' },
      { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: 'Credited on the bill, and the note has gone.' },
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
            children: 'Already given on this stay: {{$.given.0.description}} ({{$.given.0.amount_display}}).',
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
              { component: 'Textarea', ref: 'note', model: '$.note', props: { placeholder: 'In your own words — what went wrong, and what you have done about it.', rows: 3 } },
              { if: '$.drafted', then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Drafted for you. Change anything you like before it goes.' }, else: '' },
              { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', icon: 'alert' }, children: '$.error' }, else: '' },
              {
                component: 'Button',
                ref: 'give',
                props: { big: true, icon: 'sparkle', disabled: { $if: '$.note', $then: '$.working', $else: true } },
                children: { if: '$.note', then: 'Credit {{$.chosen.amount_display}} and send', else: 'Write them a line first' },
              },
            ],
          },
          else: '',
        },
      ],
    },
    else: { component: 'Empty', props: { icon: 'sparkle', title: 'No guest in hand', hint: 'Open a guest and this puts something right for them.' } },
  },
};
