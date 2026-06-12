import { type FC } from 'react';
import { LoomEditor, defaultPlugins } from '@niscorp/loom/react';
import { prism } from '@niscorp/loom/plugins/prism/react';
import type { LoomArtifact } from '@niscorp/loom';
import type { JsonObject } from '@niscorp/prism';

// The prism plugin in the Loom Editor: edit a Prism transform config and the
// preview applies it to a sample input and shows the output. The seed is a
// deep config: a plain-object template (a static target object) whose fields
// are nodes, including a nested $map over a $filter, to show the recursive
// editor at depth.

const input: JsonObject = {
  user: { id: 'u_42', name: 'Ada Lovelace', email: 'ada@example.com' },
  orders: [
    { id: 'o1', total: 120, status: 'paid' },
    { id: 'o2', total: 40, status: 'pending' },
    { id: 'o3', total: 80, status: 'paid' },
  ],
};

const config = {
  id: { $ref: '$.user.id' },
  name: { $upper: { $ref: '$.user.name' } },
  paidTotals: {
    $map: {
      over: {
        $filter: {
          over: { $ref: '$.orders' },
          as: 'order',
          when: { $eq: [{ $get: { from: { $var: 'order' }, path: ['status'] } }, { $const: 'paid' }] },
        },
      },
      as: 'order',
      body: { $get: { from: { $var: 'order' }, path: ['total'] } },
    },
  },
  orderCount: { $count: { over: { $ref: '$.orders' } } },
};

export const Demo: FC = () => (
  <div style={{ padding: 24 }}>
    <LoomEditor
      plugins={[...defaultPlugins(), prism({ input })]}
      artifact={{ type: 'prism', documents: { config } }}
    />
  </div>
);
