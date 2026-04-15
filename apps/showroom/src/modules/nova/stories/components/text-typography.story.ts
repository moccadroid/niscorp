import { Demo } from './text-typography.demo';
import source from './text-typography.demo?raw';

export const story = {
  id: 'text-typography',
  name: 'Text typography',
  description: 'Every size × weight combination, plus every supported `as` value.',
  category: 'Components',
  kind: 'layout' as const,
  Demo,
  source,
};
