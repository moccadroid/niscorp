import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = { name: 'Ada Lovelace', age: 36, tags: ['math', 'engine'] };

export const config = {
    isAdult: { $gte: [{ $ref: '$.age' }, { $const: 18 }] },
    isOver40: { $gt: [{ $ref: '$.age' }, { $const: 40 }] },
    isAda: { $eq: [{ $ref: '$.name' }, { $const: 'Ada Lovelace' }] },
    nameStartsWithA: { $startsWith: { value: { $ref: '$.name' }, prefix: { $const: 'Ada' } } },
    nameContainsLove: { $contains: { value: { $ref: '$.name' }, search: { $const: 'Love' } } },
    hasTags: { $not: { $empty: { $ref: '$.tags' } } },
  };

export const Demo = () => <PrismView input={input} config={config} />;
