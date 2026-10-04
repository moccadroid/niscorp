import type { PrismExample } from './example.types';

// Whole configs of the size an app writes.
export const REAL_WORLD: readonly PrismExample[] = [
  {
    id: 'api-to-ui',
    group: 'real-world',
    title: 'An API response, for a screen',
    description:
      'A response with paging and bookkeeping around its records becomes the smaller document a screen reads.',
    source: {
      response: {
        meta: { total: 3, page: 1, perPage: 10 },
        data: [
          {
            id: 'user_001',
            attributes: {
              displayName: 'Ada Lovelace',
              email: 'ada@example.com',
              avatarUrl: '/avatars/ada.png',
            },
            permissions: { canEdit: true, canDelete: false },
          },
          {
            id: 'user_002',
            attributes: {
              displayName: 'Grace Hopper',
              email: 'grace@example.com',
              avatarUrl: '/avatars/grace.png',
            },
            permissions: { canEdit: true, canDelete: true },
          },
          {
            id: 'user_003',
            attributes: {
              displayName: 'Linus Torvalds',
              email: 'linus@example.com',
              avatarUrl: '/avatars/linus.png',
            },
            permissions: { canEdit: false, canDelete: false },
          },
        ],
      },
    },
    config: {
      total: { $ref: '$.response.meta.total' },
      users: {
        $map: {
          over: { $ref: '$.response.data' },
          as: 'u',
          body: {
            id: { $get: { from: { $var: 'u' }, path: ['id'] } },
            name: { $get: { from: { $var: 'u' }, path: ['attributes', 'displayName'] } },
            email: { $get: { from: { $var: 'u' }, path: ['attributes', 'email'] } },
            avatar: { $get: { from: { $var: 'u' }, path: ['attributes', 'avatarUrl'] } },
            isAdmin: { $get: { from: { $var: 'u' }, path: ['permissions', 'canDelete'] } },
          },
        },
      },
    },
    expected: {
      total: 3,
      users: [
        {
          id: 'user_001',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          avatar: '/avatars/ada.png',
          isAdmin: false,
        },
        {
          id: 'user_002',
          name: 'Grace Hopper',
          email: 'grace@example.com',
          avatar: '/avatars/grace.png',
          isAdmin: true,
        },
        {
          id: 'user_003',
          name: 'Linus Torvalds',
          email: 'linus@example.com',
          avatar: '/avatars/linus.png',
          isAdmin: false,
        },
      ],
    },
  },
  {
    id: 'top-of-a-list',
    group: 'real-world',
    title: 'The top of a list',
    description: 'A leaderboard: sort by a field, highest first, and keep the first three.',
    source: {
      players: [
        { name: 'Ada', score: 187 },
        { name: 'Grace', score: 245 },
        { name: 'Linus', score: 132 },
        { name: 'Margaret', score: 298 },
        { name: 'Donald', score: 91 },
        { name: 'Tim', score: 211 },
      ],
    },
    config: {
      $slice: {
        from: {
          $sortBy: {
            over: { $ref: '$.players' },
            as: 'p',
            by: { $get: { from: { $var: 'p' }, path: ['score'] } },
            dir: 'desc',
          },
        },
        start: 0,
        end: 3,
      },
    },
    expected: [
      { name: 'Margaret', score: 298 },
      { name: 'Grace', score: 245 },
      { name: 'Tim', score: 211 },
    ],
  },
  {
    id: 'search-sort-paginate',
    group: 'real-world',
    title: 'Search, sort, paginate',
    description:
      'What a list view does, as one config: keep what matches the search, sort it, and cut out one page.',
    source: {
      products: [
        { name: 'Apple iPhone', price: 999 },
        { name: 'Samsung Galaxy', price: 899 },
        { name: 'Apple Watch', price: 399 },
        { name: 'Apple iPad', price: 599 },
        { name: 'Google Pixel', price: 699 },
        { name: 'Apple MacBook', price: 1299 },
      ],
      pageSize: 2,
      pageIndex: 1,
    },
    config: {
      $with: {
        let: {
          filtered: {
            $sortBy: {
              over: {
                $filter: {
                  over: { $ref: '$.products' },
                  as: 'p',
                  when: {
                    $contains: {
                      value: { $get: { from: { $var: 'p' }, path: ['name'] } },
                      search: { $const: 'Apple' },
                    },
                  },
                },
              },
              as: 'p',
              by: { $get: { from: { $var: 'p' }, path: ['price'] } },
              dir: 'asc',
            },
          },
        },
        value: {
          total: { $count: { over: { $var: 'filtered' } } },
          page: {
            $take: { from: { $drop: { from: { $var: 'filtered' }, count: 2 } }, count: 2 },
          },
        },
      },
    },
    expected: {
      total: 4,
      page: [
        { name: 'Apple iPhone', price: 999 },
        { name: 'Apple MacBook', price: 1299 },
      ],
    },
  },
  {
    id: 'analytics-summary',
    group: 'real-world',
    title: 'A summary of orders',
    description:
      'A small dashboard from raw orders: revenue, the average and the largest order, how many there were, and who ordered.',
    source: {
      orders: [
        { id: 'o1', customer: 'Ada', amount: 120 },
        { id: 'o2', customer: 'Grace', amount: 85 },
        { id: 'o3', customer: 'Ada', amount: 200 },
        { id: 'o4', customer: 'Linus', amount: 45 },
        { id: 'o5', customer: 'Grace', amount: 175 },
        { id: 'o6', customer: 'Ada', amount: 60 },
      ],
    },
    config: {
      totalRevenue: { $sum: { over: { $pluck: { over: { $ref: '$.orders' }, key: 'amount' } } } },
      avgOrder: { $avg: { over: { $pluck: { over: { $ref: '$.orders' }, key: 'amount' } } } },
      maxOrder: { $max: { over: { $pluck: { over: { $ref: '$.orders' }, key: 'amount' } } } },
      orderCount: { $count: { over: { $ref: '$.orders' } } },
      uniqueCustomers: { $unique: { $pluck: { over: { $ref: '$.orders' }, key: 'customer' } } },
    },
    expected: {
      totalRevenue: 685,
      avgOrder: 114.16666666666667,
      maxOrder: 200,
      orderCount: 6,
      uniqueCustomers: ['Ada', 'Grace', 'Linus'],
    },
  },
];
