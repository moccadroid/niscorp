import * as demo from './endpoint-full.demo';
import source from './endpoint-full.demo?raw';

export const story = {
  id: 'endpoint-full',
  name: 'Endpoint (full)',
  description:
    'Templated URL, headers, and a `request` transform building the body; separate success / error chains; loading + result boxes. "Save (force fail)" hits a broken endpoint so `@error.message` surfaces in the error chain.',
  category: 'Endpoints',
  kind: 'action' as const,
  ...demo,
  source,
};
