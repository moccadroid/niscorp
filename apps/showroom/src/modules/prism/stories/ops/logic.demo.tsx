import type { JsonObject } from '@niscorp/prism';
import { PrismView } from '../../prism-view';
export const input: JsonObject = {
    user: { age: 25, hasPaidPlan: true, isVerified: false },
  };

export const config = {
    canAccess: {
      $and: [
        { $gte: [{ $ref: '$.user.age' }, { $const: 18 }] },
        { $ref: '$.user.hasPaidPlan' },
      ],
    },
    needsVerification: { $not: { $ref: '$.user.isVerified' } },
    canPostOrCanComment: {
      $or: [{ $ref: '$.user.hasPaidPlan' }, { $ref: '$.user.isVerified' }],
    },
  };

export const Demo = () => <PrismView input={input} config={config} />;
