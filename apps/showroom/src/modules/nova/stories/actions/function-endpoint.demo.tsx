import {
  createShell,
  type ActionDefinition,
  type FunctionHandler,
} from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// An endpoint whose transport is a local function instead of HTTP.
// `call: 'compute'` dispatches through the same runtime path as an HTTP
// call, but resolves via the shell's `functions` registry. The handler
// receives the action's data snapshot, does local work, and returns
// a value — Nova writes it to `target`, same as a fetch response.

const computeStats: FunctionHandler = async (data) => {
  // Simulate some local work — a computation, a DB lookup, an AI pipeline.
  await new Promise<void>((resolve) => setTimeout(resolve, 250));
  const numbers = Array.isArray(data['numbers']) ? (data['numbers'] as number[]) : [];
  const sum = numbers.reduce((acc, n) => acc + n, 0);
  const avg = numbers.length === 0 ? 0 : sum / numbers.length;
  return { count: numbers.length, sum, avg: Math.round(avg * 100) / 100 };
};

const functionEndpoint: ActionDefinition = {
  id: 'function-endpoint',
  data: {
    numbers: [12, 7, 19, 4, 26, 11],
    loading: false,
    stats: undefined,
  },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      {
        component: 'Text',
        props: { weight: 'bold', size: 'xl' },
        children: 'Local function endpoint',
      },
      {
        component: 'Text',
        props: { color: '#6b7280' },
        children: 'Input: {{$.numbers}}',
      },
      { component: 'Button', ref: 'run', children: 'Compute stats' },
      { if: '$.loading', then: { component: 'Text', children: 'Computing...' } },
      {
        if: '$.stats',
        then: {
          component: 'Box',
          props: { padding: 12, background: '#eef2ff', radius: 6 },
          children: {
            component: 'Stack',
            props: { direction: 'column', gap: 4 },
            children: [
              { component: 'Text', children: 'count = {{$.stats.count}}' },
              { component: 'Text', children: 'sum   = {{$.stats.sum}}' },
              { component: 'Text', children: 'avg   = {{$.stats.avg}}' },
            ],
          },
        },
      },
    ],
  },
  endpoints: {
    compute: { fn: 'computeStats', target: 'stats' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'run',
      do: [
        { set: 'loading', value: true },
        {
          call: 'compute',
          onSuccess: [{ set: 'loading', value: false }],
          onError: [{ set: 'loading', value: false }],
        },
      ],
    },
  ],
};

const shell = createShell({
  canvases: [{ id: 'main', initial: 'function-endpoint' }],
  actions: { 'function-endpoint': functionEndpoint },
  functions: { computeStats },
});

export { shell };

export const Demo = () => <Nova.Shell shell={shell} />;
