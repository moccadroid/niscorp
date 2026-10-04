import type { NovaExample } from './example.types';

// The layout grammar, a part at a time. Each is an action with no triggers:
// its layout is resolved against its data, and that is the whole example.
export const LAYOUT_EXAMPLES: readonly NovaExample[] = [
  {
    id: 'path',
    group: 'layouts',
    title: 'Path',
    description: 'A string that starts with `$.` is a path into the data. It is replaced by what stands there; a value further in is reached by a longer path.',
    action: {
      id: 'path',
      data: { member: { name: 'Ada', city: 'London' } },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', children: '$.member.name' },
          { component: 'Text', children: '$.member.city' },
        ],
      },
    },
    presses: [],
    expected: { says: ['Ada', 'London'], data: { member: { name: 'Ada', city: 'London' } } },
  },
  {
    id: 'templates',
    group: 'layouts',
    title: 'Templates',
    description: 'A string with `{{…}}` in it is a template. Each expression between the braces is resolved and written into the sentence.',
    action: {
      id: 'templates',
      data: { name: 'Ada', count: 3 },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', children: 'Hello, {{$.name}}.' },
          { component: 'Text', children: '{{$.count}} new messages' },
        ],
      },
    },
    presses: [],
    expected: { says: ['Hello, Ada.', '3 new messages'], data: { name: 'Ada', count: 3 } },
  },
  {
    id: 'conditional',
    group: 'layouts',
    title: 'Conditional',
    description: 'An `if` node draws its `then` when the path holds something and its `else` when it does not. Without an `else`, it draws nothing.',
    action: {
      id: 'conditional',
      data: { signedIn: true, basket: [] },
      layout: {
        component: 'Stack',
        children: [
          { if: '$.signedIn', then: { component: 'Text', children: 'Welcome back.' }, else: { component: 'Text', children: 'Sign in to go on.' } },
          { if: '$.basket.0', then: { component: 'Text', children: 'There is something in your basket.' }, else: { component: 'Text', children: 'Your basket is empty.' } },
          { if: '$.basket.0', then: { component: 'Text', children: 'Go to the till.' } },
        ],
      },
    },
    presses: [],
    expected: { says: ['Welcome back.', 'Your basket is empty.'], data: { signedIn: true, basket: [] } },
  },
  {
    id: 'missing-paths',
    group: 'layouts',
    title: 'Missing paths',
    description: 'A path with nothing at it is not an error. On its own it draws nothing, and in a template it leaves its place empty.',
    action: {
      id: 'missing-paths',
      data: { member: { name: 'Ada' } },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', children: '$.member.name' },
          { component: 'Text', children: '$.member.nickname' },
          { component: 'Text', children: 'Known as {{$.member.nickname}}.' },
        ],
      },
    },
    presses: [],
    expected: { says: ['Ada', 'Known as .'], data: { member: { name: 'Ada' } } },
  },
  {
    id: 'loop',
    group: 'layouts',
    title: 'Loop',
    description: 'A `for` node draws its `do` once for each element of a list. `as` names the element for the bindings inside, and `key` names the field that tells one element from another.',
    action: {
      id: 'loop',
      data: {
        members: [
          { id: 'm1', name: 'Ada' },
          { id: 'm2', name: 'Grace' },
          { id: 'm3', name: 'Linus' },
        ],
      },
      layout: {
        component: 'Stack',
        children: [{ for: '$.members', as: 'member', key: 'id', do: { component: 'Text', children: '$member.name' } }],
      },
    },
    presses: [],
    expected: { says: ['Ada', 'Grace', 'Linus'], data: { members: [{ id: 'm1', name: 'Ada' }, { id: 'm2', name: 'Grace' }, { id: 'm3', name: 'Linus' }] } },
  },
  {
    id: 'loop-index',
    group: 'layouts',
    title: 'Index',
    description: 'Inside a loop, `$index` is the position of the element, counted from zero.',
    action: {
      id: 'loop-index',
      data: { steps: ['Book', 'Pay', 'Go'] },
      layout: {
        component: 'Stack',
        children: [{ for: '$.steps', as: 'step', do: { component: 'Text', children: '{{$index}}: {{$step}}' } }],
      },
    },
    presses: [],
    expected: { says: ['0: Book', '1: Pay', '2: Go'], data: { steps: ['Book', 'Pay', 'Go'] } },
  },
  {
    id: 'nested-loops',
    group: 'layouts',
    title: 'Nested loops',
    description: "A loop inside a loop. The inner one reads the outer one's element as well as its own.",
    action: {
      id: 'nested-loops',
      data: {
        rows: [
          { name: 'A', seats: [1, 2] },
          { name: 'B', seats: [1, 2, 3] },
        ],
      },
      layout: {
        component: 'Stack',
        children: [{ for: '$.rows', as: 'row', key: 'name', do: { for: '$row.seats', as: 'seat', do: { component: 'Text', children: '{{$row.name}}{{$seat}}' } } }],
      },
    },
    presses: [],
    expected: { says: ['A1', 'A2', 'B1', 'B2', 'B3'], data: { rows: [{ name: 'A', seats: [1, 2] }, { name: 'B', seats: [1, 2, 3] }] } },
  },
  {
    id: 'directives',
    group: 'layouts',
    title: 'Directives',
    description: 'Where a value is wanted, a directive works one out. `$eq` says whether two values are the same; here it decides an `if`, so the layout can ask more of the data than whether something is there.',
    action: {
      id: 'directives',
      data: { tab: 'members', seats: 2 },
      layout: {
        component: 'Stack',
        children: [
          { if: { $eq: ['$.tab', 'members'] }, then: { component: 'Text', children: 'Showing members' }, else: { component: 'Text', children: 'Showing everyone' } },
          { if: { $eq: ['$.seats', 1] }, then: { component: 'Text', children: 'One seat' }, else: { component: 'Text', children: '{{$.seats}} seats' } },
        ],
      },
    },
    presses: [],
    expected: { says: ['Showing members', '2 seats'], data: { tab: 'members', seats: 2 } },
  },
];
