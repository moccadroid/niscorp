import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = {
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
  };

export const config = {
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
  };

export const Demo = () => <PrismView input={input} config={config} />;
