import type { NovaExample } from './example.types';

// The layout grammar, put together: conditions inside conditions and inside
// loops, a list with nothing in it, and a layout kept once and used twice.
export const STRUCTURE_EXAMPLES: readonly NovaExample[] = [
  {
    id: 'nested-conditionals',
    group: 'layouts',
    title: 'Nested conditionals',
    description: 'An `if` inside an `if`. The outer one asks whether anybody is signed in, the inner one what kind of member they are: three screens from one layout.',
    action: {
      id: 'nested-conditionals',
      data: { member: { name: 'Ada', staff: true } },
      layout: {
        if: '$.member',
        then: {
          if: '$.member.staff',
          then: { component: 'Text', children: '{{$.member.name}} works at the box office.' },
          else: { component: 'Text', children: '{{$.member.name}} is a member.' },
        },
        else: { component: 'Text', children: 'Nobody is signed in.' },
      },
    },
    presses: [],
    expected: { says: ['Ada works at the box office.'], data: { member: { name: 'Ada', staff: true } } },
  },
  {
    id: 'conditional-in-loop',
    group: 'layouts',
    title: 'Conditional in a loop',
    description: 'A condition inside a `for` reads the element of that turn, so each row decides for itself.',
    action: {
      id: 'conditional-in-loop',
      data: {
        seats: [
          { id: 'C4', taken: true },
          { id: 'C5', taken: false },
          { id: 'C6', taken: true },
        ],
      },
      layout: {
        component: 'Stack',
        children: [
          {
            for: '$.seats',
            as: 'seat',
            key: 'id',
            do: { if: '$seat.taken', then: { component: 'Text', children: '{{$seat.id}} is taken' }, else: { component: 'Text', children: '{{$seat.id}} is free' } },
          },
        ],
      },
    },
    presses: [],
    expected: { says: ['C4 is taken', 'C5 is free', 'C6 is taken'], data: { seats: [{ id: 'C4', taken: true }, { id: 'C5', taken: false }, { id: 'C6', taken: true }] } },
  },
  {
    id: 'empty-list',
    group: 'layouts',
    title: 'Empty list',
    description: 'A loop over an empty list draws nothing. An `if` on its first element puts a line there where the list would be.',
    action: {
      id: 'empty-list',
      data: { bookings: [] },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', children: 'Your bookings' },
          { if: '$.bookings.0', then: { for: '$.bookings', as: 'booking', do: { component: 'Text', children: '$booking' } }, else: { component: 'Text', children: 'None yet.' } },
        ],
      },
    },
    presses: [],
    expected: { says: ['Your bookings', 'None yet.'], data: { bookings: [] } },
  },
  {
    id: 'layout-refs',
    group: 'layouts',
    title: 'Layout refs',
    description: 'A layout kept under a name is used wherever `{ ref }` names it. It is drawn in the place that names it, so inside a loop it reads the element of that turn.',
    layouts: {
      'layout-refs.card': {
        component: 'Stack',
        children: [
          { component: 'Text', children: '$member.name' },
          { component: 'Text', children: 'Row {{$member.row}}' },
        ],
      },
    },
    action: {
      id: 'layout-refs',
      data: {
        members: [
          { id: 'm1', name: 'Ada', row: 'C' },
          { id: 'm2', name: 'Grace', row: 'F' },
        ],
      },
      layout: { component: 'Stack', children: [{ for: '$.members', as: 'member', key: 'id', do: { ref: 'layout-refs.card' } }] },
    },
    presses: [],
    expected: { says: ['Ada', 'Row C', 'Grace', 'Row F'], data: { members: [{ id: 'm1', name: 'Ada', row: 'C' }, { id: 'm2', name: 'Grace', row: 'F' }] } },
  },
  {
    id: 'set-from',
    group: 'actions',
    title: 'Set from',
    description: '`set` with `from` copies what stands at one path to another. Here every step first keeps the count it is about to change, so one press takes it back.',
    action: {
      id: 'set-from',
      data: { count: 1, before: 1 },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', children: 'Seats: {{$.count}}' },
          { component: 'Button', ref: 'more', children: 'One more' },
          { component: 'Button', ref: 'undo', children: 'Undo' },
        ],
      },
      triggers: [
        {
          event: 'ui:click',
          ref: 'more',
          do: [{ set: 'before', from: 'count' }, { increment: 'count' }],
        },
        { event: 'ui:click', ref: 'undo', do: [{ set: 'count', from: 'before' }] },
      ],
    },
    presses: [{ ref: 'more' }, { ref: 'more' }, { ref: 'undo' }],
    expected: { says: ['Seats: 2', 'One more', 'Undo'], data: { count: 2, before: 2 } },
  },
];
