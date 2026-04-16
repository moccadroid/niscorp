import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '@showroom/modules/prism/prism-view';
export const input: JsonObject = { createdAt: '2024-01-15T08:30:00Z', now: '2024-04-22T10:00:00Z' };

export const config = {
    formatted: { $date: { value: { $ref: '$.createdAt' }, format: 'YYYY-MM-DD' } },
    plus30Days: {
      $date: {
        value: {
          $dateAdd: { date: { $ref: '$.createdAt' }, amount: 30, unit: 'day' },
        },
        format: 'YYYY-MM-DD',
      },
    },
    daysSinceCreated: {
      $dateDiff: { from: { $ref: '$.createdAt' }, to: { $ref: '$.now' }, unit: 'day' },
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
