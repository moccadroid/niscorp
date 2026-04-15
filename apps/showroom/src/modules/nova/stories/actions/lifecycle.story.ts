import * as demo from './lifecycle.demo';
import source from './lifecycle.demo?raw';

export const story = {
  id: 'lifecycle',
  name: 'Lifecycle hooks',
  description:
    'The `mount` hook runs once at action startup. Its ops flip `mounted` to true and push a single "mount" event — both reflected in the view.',
  category: 'Lifecycle',
  kind: 'action' as const,
  ...demo,
  source,
};
