import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = {
    players: [
      { name: 'Ada', score: 187 },
      { name: 'Grace', score: 245 },
      { name: 'Linus', score: 132 },
      { name: 'Margaret', score: 298 },
      { name: 'Donald', score: 91 },
      { name: 'Tim', score: 211 },
    ],
  };

export const config = {
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
  };

export const Demo = () => <PrismView input={input} config={config} />;
