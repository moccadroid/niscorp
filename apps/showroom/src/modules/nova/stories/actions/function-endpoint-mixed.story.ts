import * as demo from './function-endpoint-mixed.demo';
import source from './function-endpoint-mixed.demo?raw';

export const story = {
  id: 'function-endpoint-mixed',
  name: 'Function + HTTP mixed',
  description:
    'HTTP and function endpoints in the same `endpoints` map. One click chains an HTTP fetch into a local enrichment function; the force-fail variant lands in the function\'s `onError` branch with `@error.message` bound. Same `call` step, different transports.',
  category: 'Endpoints',
  kind: 'action' as const,
  ...demo,
  source,
};
