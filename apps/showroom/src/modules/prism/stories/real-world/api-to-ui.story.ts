import * as demo from './api-to-ui.demo';
import source from './api-to-ui.demo?raw';

export const story = {
  id: 'api-to-ui',
  name: 'API → UI shape',
  description: 'A realistic transformation: take a verbose API response with metadata + paginated results and shape it into the leaner JSON a UI actually consumes.',
  category: 'Real world',
  kind: 'transform' as const,
  ...demo,
  source,
};
