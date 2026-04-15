import { Demo } from './list-mode-feed.demo';
import source from './list-mode-feed.demo?raw';

export const story = {
  id: 'list-mode-feed',
  name: 'Activity feed — vertical list',
  description:
    'List-mode `actionLayout` on the feed canvas loops `$.instances` and emits an ActionSlot per entry — every push adds a card, nothing gets replaced.',
  category: 'Layouts',
  kind: 'shell' as const,
  Demo,
  source,
};
