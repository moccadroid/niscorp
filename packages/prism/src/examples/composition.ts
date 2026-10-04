import type { PrismExample } from './example.types';

// Operators working together: templates, nesting, naming a value once.
export const COMPOSITION: readonly PrismExample[] = [
  {
    id: 'pick-and-rename',
    group: 'composition',
    title: 'Pick and rename',
    description:
      'A plain object in a config is a template: each of its values is an expression. Reading fields into new names is a template of `$ref`s.',
    source: {
      raw: {
        user_id: 'u_42',
        first_name: 'Ada',
        last_name: 'Lovelace',
        created_at: '2024-01-01',
        internal_token: 'sekret',
        legacy_field: 'ignored',
      },
    },
    config: {
      id: { $ref: '$.raw.user_id' },
      firstName: { $ref: '$.raw.first_name' },
      lastName: { $ref: '$.raw.last_name' },
      createdAt: { $ref: '$.raw.created_at' },
    },
    expected: { id: 'u_42', firstName: 'Ada', lastName: 'Lovelace', createdAt: '2024-01-01' },
  },
  {
    id: 'map-to-a-shape',
    group: 'composition',
    title: 'Map to a shape',
    description:
      'The body of a `$map` may be a template, so every record of a list comes out in a new shape.',
    source: {
      users: [
        { id: 'u_1', first: 'Ada', last: 'Lovelace' },
        { id: 'u_2', first: 'Grace', last: 'Hopper' },
        { id: 'u_3', first: 'Linus', last: 'Torvalds' },
      ],
    },
    config: {
      $map: {
        over: { $ref: '$.users' },
        as: 'u',
        body: {
          id: { $get: { from: { $var: 'u' }, path: ['id'] } },
          fullName: {
            $join: {
              sep: ' ',
              parts: [
                { $get: { from: { $var: 'u' }, path: ['first'] } },
                { $get: { from: { $var: 'u' }, path: ['last'] } },
              ],
            },
          },
        },
      },
    },
    expected: [
      { id: 'u_1', fullName: 'Ada Lovelace' },
      { id: 'u_2', fullName: 'Grace Hopper' },
      { id: 'u_3', fullName: 'Linus Torvalds' },
    ],
  },
  {
    id: 'filter-then-map',
    group: 'composition',
    title: 'Filter, then map',
    description:
      'Operators nest: what one gives is what the next takes. Here the list is filtered first, and what is left is mapped.',
    source: {
      products: [
        { name: 'Apple', price: 1.5, inStock: true },
        { name: 'Banana', price: 0.5, inStock: false },
        { name: 'Carrot', price: 2, inStock: true },
        { name: 'Date', price: 3, inStock: false },
      ],
    },
    config: {
      $map: {
        over: {
          $filter: {
            over: { $ref: '$.products' },
            as: 'p',
            when: { $get: { from: { $var: 'p' }, path: ['inStock'] } },
          },
        },
        as: 'p',
        body: { $get: { from: { $var: 'p' }, path: ['name'] } },
      },
    },
    expected: ['Apple', 'Carrot'],
  },
  {
    id: 'calculated-fields',
    group: 'composition',
    title: 'Calculated fields',
    description:
      'Derived fields from raw input: the lines of a cart become a subtotal, tax and total. `$with` names the subtotal once, and `$round` fixes the digits.',
    source: {
      items: [
        { name: 'Widget', price: 9.99, qty: 3 },
        { name: 'Gadget', price: 19.5, qty: 2 },
        { name: 'Sprocket', price: 4.25, qty: 5 },
      ],
      taxRate: 0.08,
    },
    config: {
      $with: {
        let: {
          subtotal: {
            $sum: {
              over: {
                $map: {
                  over: { $ref: '$.items' },
                  as: 'item',
                  body: {
                    $mul: [
                      { $get: { from: { $var: 'item' }, path: ['price'] } },
                      { $get: { from: { $var: 'item' }, path: ['qty'] } },
                    ],
                  },
                },
              },
            },
          },
        },
        value: {
          subtotal: { $round: { value: { $var: 'subtotal' }, digits: 2 } },
          tax: {
            $round: {
              value: { $mul: [{ $var: 'subtotal' }, { $ref: '$.taxRate' }] },
              digits: 2,
            },
          },
          total: {
            $round: {
              value: {
                $add: [
                  { $var: 'subtotal' },
                  { $mul: [{ $var: 'subtotal' }, { $ref: '$.taxRate' }] },
                ],
              },
              digits: 2,
            },
          },
          itemCount: { $count: { over: { $ref: '$.items' } } },
        },
      },
    },
    expected: { subtotal: 90.22, tax: 7.22, total: 97.44, itemCount: 3 },
  },
  {
    id: 'denormalize-a-join',
    group: 'composition',
    title: 'Denormalize a join',
    description:
      'Two lists that refer to each other become one: each user comes out with the posts that name them, found with a `$filter` inside the `$map`.',
    source: {
      users: [
        { id: 'u1', name: 'Ada' },
        { id: 'u2', name: 'Grace' },
        { id: 'u3', name: 'Linus' },
      ],
      posts: [
        { id: 'p1', authorId: 'u1', title: 'On Bernoulli' },
        { id: 'p2', authorId: 'u1', title: 'Engine notes' },
        { id: 'p3', authorId: 'u2', title: 'COBOL origins' },
        { id: 'p4', authorId: 'u3', title: 'Just for fun' },
        { id: 'p5', authorId: 'u3', title: 'Linux history' },
      ],
    },
    config: {
      $map: {
        over: { $ref: '$.users' },
        as: 'user',
        body: {
          id: { $get: { from: { $var: 'user' }, path: ['id'] } },
          name: { $get: { from: { $var: 'user' }, path: ['name'] } },
          posts: {
            $filter: {
              over: { $ref: '$.posts' },
              as: 'post',
              when: {
                $eq: [
                  { $get: { from: { $var: 'post' }, path: ['authorId'] } },
                  { $get: { from: { $var: 'user' }, path: ['id'] } },
                ],
              },
            },
          },
        },
      },
    },
    expected: [
      {
        id: 'u1',
        name: 'Ada',
        posts: [
          { id: 'p1', authorId: 'u1', title: 'On Bernoulli' },
          { id: 'p2', authorId: 'u1', title: 'Engine notes' },
        ],
      },
      {
        id: 'u2',
        name: 'Grace',
        posts: [{ id: 'p3', authorId: 'u2', title: 'COBOL origins' }],
      },
      {
        id: 'u3',
        name: 'Linus',
        posts: [
          { id: 'p4', authorId: 'u3', title: 'Just for fun' },
          { id: 'p5', authorId: 'u3', title: 'Linux history' },
        ],
      },
    ],
  },
];
