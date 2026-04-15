import { Demo } from './stack-alignments.demo';
import source from './stack-alignments.demo?raw';

export const story = {
  id: 'stack-alignments',
  name: 'Stack alignments',
  description: 'Every align × justify combination on a row Stack.',
  category: 'Components',
  kind: 'layout' as const,
  Demo,
  source,
};
