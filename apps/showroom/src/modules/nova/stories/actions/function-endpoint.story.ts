import * as demo from './function-endpoint.demo';
import source from './function-endpoint.demo?raw';

export const story = {
  id: 'function-endpoint',
  name: 'Function endpoint',
  description:
    'An endpoint whose transport is a local function. `call: \'compute\'` dispatches through the same runtime path as an HTTP call, but resolves via the shell\'s `functions` registry. Click Compute stats — the handler reads `$.numbers`, does local work, and writes the result to `$.stats` via `target`.',
  category: 'Endpoints',
  kind: 'action' as const,
  ...demo,
  source,
};
