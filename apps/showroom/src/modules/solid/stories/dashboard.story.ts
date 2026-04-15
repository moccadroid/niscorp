import * as demo from './dashboard.demo';
import source from './dashboard.demo?raw';

export const story = {
  id: 'dashboard',
  name: 'Live dashboard',
  description: 'Multiple dashboard panels assemble simultaneously, each locking in as it finalizes.',
  category: 'Live UI',
  kind: 'stream-demo' as const,
  ...demo,
  source,
};
