import { Demo } from './set-from-undo.demo';
import source from './set-from-undo.demo?raw';

export const story = {
  id: 'set-from-undo',
  name: 'Set { from } undo',
  description:
    '`{ set, from }` copies one path into another. Increment snapshots current → previous then bumps; Undo copies previous back.',
  category: 'Basics',
  kind: 'action' as const,
  Demo,
  source,
};
