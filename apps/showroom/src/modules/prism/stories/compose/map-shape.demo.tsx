import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = {
    users: [
      { id: 'u_1', first: 'Ada', last: 'Lovelace' },
      { id: 'u_2', first: 'Grace', last: 'Hopper' },
      { id: 'u_3', first: 'Linus', last: 'Torvalds' },
    ],
  };

export const config = {
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
  };

export const Demo = () => <PrismView input={input} config={config} />;
