import type { LayoutNode } from '@niscorp/nova';

// Airport transfers, three ways: the guest books their own, the desk books one
// for whoever is in hand, and the night porter reads tomorrow's cars in leaving
// order.
//
// The ROUTES are Opera's catalogue rows — destination, vehicle and price all
// shipped by the connector — and the TIME is typed. That split is the whole
// design of the card: a price is a fact somebody set, and what time a car should
// come is a judgement about a flight nobody has told the database about. So the
// menu can never be wrong and the time can always be suggested.

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
    { component: 'Input', ref: 'time', model: '$.pickupAt', props: { placeholder: '06:15' } },
    { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Twenty-four hour. Allow an hour more than you think for the airport.' },
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

// ─── the guest's own ─────────────────────────────────────────
export const transferLayout: LayoutNode = {
  if: '$.done',
  then: {
    component: 'Stack',
    props: { gap: 10, align: 'center' },
    children: [
      { component: 'Icon', props: { name: 'check', size: 24, color: 'accent' } },
      { component: 'Text', props: { weight: 600 }, children: 'The car is booked' },
      { component: 'Text', props: { size: 'sm', color: 'mute', align: 'center' }, children: '{{$.booked.at}} to {{$.booked.destination}} — {{$.booked.driver}} is driving. Reference {{$.booked.confirmation}}.' },
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

// ─── the desk, for the guest in hand ─────────────────────────
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
    // Opened with nobody in hand — say so rather than offering the house.
    else: { component: 'Empty', props: { icon: 'door', title: 'No guest in hand', hint: 'Open a guest and this books their car.' } },
  },
};

// ─── the morning's cars ──────────────────────────────────────
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
