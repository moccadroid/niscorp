import { Demo } from './stack.demo';
import source from './stack.demo?raw';

export const story = {
  id: 'stack',
  name: 'Stack',
  description:
    'The Stack flex primitive — direction, gap, padding, align. Three coloured Boxes side-by-side.',
  category: 'Components',
  kind: 'layout' as const,
  Demo,
  source,
};
