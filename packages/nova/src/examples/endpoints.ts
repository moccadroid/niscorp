import type { NovaExample } from './example.types';

// How an action reaches outside itself. What answers is said beside the
// action (`replies`, `fetches`), so the example comes to the same thing wherever
// it is run.
export const ENDPOINT_EXAMPLES: readonly NovaExample[] = [
  {
    id: 'function-endpoint',
    group: 'endpoints',
    title: 'Function endpoint',
    description: 'An endpoint that names a function its host has registered. `call` runs it with the action’s data, and what it answers is written to the endpoint’s `target`.',
    replies: { 'function-endpoint.total': { seats: 3, price: 114 } },
    action: {
      id: 'function-endpoint',
      data: { total: { seats: 0, price: 0 } },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', children: '{{$.total.seats}} seats, {{$.total.price}} in all' },
          { component: 'Button', ref: 'add', children: 'Add it up' },
        ],
      },
      endpoints: { total: { fn: 'function-endpoint.total', target: 'total' } },
      triggers: [{ event: 'ui:click', ref: 'add', do: [{ call: 'total' }] }],
    },
    presses: [{ ref: 'add' }],
    expected: { says: ['3 seats, 114 in all', 'Add it up'], data: { total: { seats: 3, price: 114 } } },
  },
  {
    id: 'http-endpoint',
    group: 'endpoints',
    title: 'HTTP endpoint',
    description: 'An endpoint that names a URL. The address is a template over the action’s data, and `onSuccess` runs once the answer has been written to `target`.',
    fetches: { 'GET /examples/http-endpoint/members/m1': { status: 200, body: { name: 'Ada', pass: 'season' } } },
    action: {
      id: 'http-endpoint',
      data: { id: 'm1', state: 'not asked', member: { name: '', pass: '' } },
      layout: {
        component: 'Stack',
        children: [
          { component: 'Text', children: 'State: {{$.state}}' },
          { if: '$.member.name', then: { component: 'Text', children: '{{$.member.name}} has a {{$.member.pass}} pass.' } },
          { component: 'Button', ref: 'load', children: 'Look the member up' },
        ],
      },
      endpoints: { member: { url: '/examples/http-endpoint/members/{{$.id}}', method: 'GET', target: 'member' } },
      triggers: [{ event: 'ui:click', ref: 'load', do: [{ set: 'state', value: 'asking' }, { call: 'member', onSuccess: [{ set: 'state', value: 'answered' }] }] }],
    },
    presses: [{ ref: 'load' }],
    expected: { says: ['State: answered', 'Ada has a season pass.', 'Look the member up'], data: { id: 'm1', state: 'answered', member: { name: 'Ada', pass: 'season' } }, asked: [{ method: 'GET', url: '/examples/http-endpoint/members/m1' }] },
  },
  {
    id: 'endpoint-error',
    group: 'endpoints',
    title: 'Endpoint error',
    description: 'A call that fails runs its `onError` steps and no others. Inside them `@error` is what went wrong: its `status`, and a `message`.',
    fetches: { 'POST /examples/endpoint-error/bookings': { status: 409, body: { message: 'That seat has just been taken.' } } },
    action: {
      id: 'endpoint-error',
      data: { booked: false, problem: '', status: 0 },
      layout: {
        component: 'Stack',
        children: [
          { if: '$.booked', then: { component: 'Text', children: 'Booked.' } },
          { if: '$.problem', then: { component: 'Text', children: '{{$.status}}: {{$.problem}}' } },
          { component: 'Button', ref: 'book', children: 'Book seat C4' },
        ],
      },
      endpoints: { book: { url: '/examples/endpoint-error/bookings', method: 'POST' } },
      triggers: [
        {
          event: 'ui:click',
          ref: 'book',
          do: [
            {
              call: 'book',
              onSuccess: [{ set: 'booked', value: true }],
              onError: [
                { set: 'problem', value: '{{@error.message}}' },
                { set: 'status', value: '{{@error.status}}' },
              ],
            },
          ],
        },
      ],
    },
    presses: [{ ref: 'book' }],
    expected: { says: ['409: That seat has just been taken.', 'Book seat C4'], data: { booked: false, problem: 'That seat has just been taken.', status: 409 }, asked: [{ method: 'POST', url: '/examples/endpoint-error/bookings' }] },
  },
  {
    id: 'endpoint-request',
    group: 'endpoints',
    title: 'Request and headers',
    description: 'What is sent is declared on the endpoint. A header is a template over the action’s data, and `request` is a transform that builds the body from that data, so nothing but what it names leaves the action. `response` is a transform over what comes back, before it is written to `target`.',
    fetches: { 'POST /examples/endpoint-request/bookings': { status: 200, body: { id: 'B-2041', seats: 2 } } },
    action: {
      id: 'endpoint-request',
      data: { token: 'box-office', member: 'm1', seats: ['C4', 'C5'], note: 'not for the server', booking: '' },
      layout: {
        component: 'Stack',
        children: [
          { if: '$.booking', then: { component: 'Text', children: 'Booked as {{$.booking}}.' } },
          { component: 'Button', ref: 'book', children: 'Book both seats' },
        ],
      },
      endpoints: {
        book: {
          url: '/examples/endpoint-request/bookings',
          method: 'POST',
          headers: { authorization: 'Bearer {{$.token}}' },
          request: { member: { $ref: '$.member' }, seats: { $length: { $ref: '$.seats' } } },
          response: { $ref: '$.id' },
          target: 'booking',
        },
      },
      triggers: [{ event: 'ui:click', ref: 'book', do: [{ call: 'book' }] }],
    },
    presses: [{ ref: 'book' }],
    expected: { says: ['Booked as B-2041.', 'Book both seats'], data: { token: 'box-office', member: 'm1', seats: ['C4', 'C5'], note: 'not for the server', booking: 'B-2041' }, asked: [{ method: 'POST', url: '/examples/endpoint-request/bookings', headers: { authorization: 'Bearer box-office' }, body: { member: 'm1', seats: 2 } }] },
  },
  {
    id: 'endpoint-chain',
    group: 'endpoints',
    title: 'One call after another',
    description: 'A URL and a function in the same action. `onSuccess` of the first call makes the second, which by then finds the first one’s answer in the data. To the steps a call is a call: where it goes is the endpoint’s business.',
    fetches: { 'GET /examples/endpoint-chain/members/m1': { status: 200, body: { name: 'Ada', seats: ['C4', 'C5'] } } },
    replies: { 'endpoint-chain.price': { total: 76 } },
    action: {
      id: 'endpoint-chain',
      data: { member: { name: '', seats: [] }, price: { total: 0 } },
      layout: {
        component: 'Stack',
        children: [
          { if: '$.member.name', then: { component: 'Text', children: '{{$.member.name}} owes {{$.price.total}}.' } },
          { component: 'Button', ref: 'load', children: 'Work out what is owed' },
        ],
      },
      endpoints: {
        member: { url: '/examples/endpoint-chain/members/m1', method: 'GET', target: 'member' },
        price: { fn: 'endpoint-chain.price', target: 'price' },
      },
      triggers: [{ event: 'ui:click', ref: 'load', do: [{ call: 'member', onSuccess: [{ call: 'price' }] }] }],
    },
    presses: [{ ref: 'load' }],
    expected: { says: ['Ada owes 76.', 'Work out what is owed'], data: { member: { name: 'Ada', seats: ['C4', 'C5'] }, price: { total: 76 } }, asked: [{ method: 'GET', url: '/examples/endpoint-chain/members/m1' }] },
  },
];
