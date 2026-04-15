import * as demo from './const.demo';
import source from './const.demo?raw';

export const story = {
  id: 'const',
  name: '$const',
  description:
    'Returns a literal JSON value unchanged. The simplest op — useful as a building block inside other expressions.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
