import type { PrismStory } from '../../story-types';

export const searchSortPaginateStory: PrismStory = {
  id: 'search-sort-paginate',
  name: 'Search → sort → paginate',
  description:
    'The classic list-view pipeline: filter by search term, sort by a field, paginate. Each stage feeds the next. Uses `$match` for the search (sugar over `$filter + $contains`), `$sortBy` for the sort, and `$take`/`$drop` for paging.',
  category: 'Real world',
  kind: 'transform',
  input: {
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
          $take: {
            from: {
              $drop: {
                from: { $var: 'filtered' },
                count: 2,
              },
            },
            count: 2,
          },
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
};
