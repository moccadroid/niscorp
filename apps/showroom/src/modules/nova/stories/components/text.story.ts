import { Demo } from './text.demo';
import source from './text.demo?raw';

export const story = {
  id: 'text',
  name: 'Text',
  description: 'Several Text variants stacked vertically — different as, size, weight, color.',
  category: 'Components',
  kind: 'layout' as const,
  Demo,
  source,
};
