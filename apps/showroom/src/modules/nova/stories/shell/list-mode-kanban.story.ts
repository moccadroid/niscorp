import { Demo } from './list-mode-kanban.demo';
import source from './list-mode-kanban.demo?raw';

export const story = {
  id: 'list-mode-kanban',
  name: 'Kanban — horizontal list',
  description:
    'Same list-mode trick as the feed story, but `direction: "row"` and `wrap: true` on the actionLayout Stack turn it into a wrapping kanban strip.',
  category: 'Layouts',
  kind: 'shell' as const,
  Demo,
  source,
};
