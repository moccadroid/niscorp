import * as demo from './endpoint.demo';
import source from './endpoint.demo?raw';

export const story = {
  id: 'endpoint',
  name: 'Endpoint call',
  description:
    'A `call` op against a mocked fetch. Click Load user — loading flips true, the call resolves, the response lands at `$.user`, and the greeting replaces the spinner.',
  category: 'Endpoints',
  kind: 'action' as const,
  ...demo,
  source,
};
