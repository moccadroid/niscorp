import { Demo } from './numbered-list.demo';
import source from './numbered-list.demo?raw';

export const story = {
  id: 'structure-numbered-list',
  name: 'Numbered list',
  description:
    'The implicit `$index` scope variable combined with `{{$item.name}}` renders a zero-indexed list — no counter state needed.',
  category: 'Structure',
  kind: 'layout' as const,
  Demo,
  source,
};
