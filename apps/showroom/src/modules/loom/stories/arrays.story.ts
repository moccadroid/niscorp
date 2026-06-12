import * as demo from './arrays.demo';
import source from './arrays.demo?raw';

export const story = {
  id: 'arrays',
  name: 'Arrays',
  description:
    'Lists of scalars and of objects, each with Add and per-item remove (✕) and reorder (↑ / ↓). The controls carry the item index as the click payload and compile to declarative push / removeAt / move triggers — visible in the Definition tab.',
  category: 'Structure',
  kind: 'structure' as const,
  ...demo,
  source,
};
