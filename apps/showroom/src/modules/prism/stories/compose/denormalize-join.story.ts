import * as demo from './denormalize-join.demo';
import source from './denormalize-join.demo?raw';

export const story = {
  id: 'denormalize-join',
  name: 'Denormalize join',
  description: 'Take separate `users` and `posts` arrays (relational shape) and produce `users` with their posts inlined. Uses `$keyBy` to index posts by author, then `$map` over users to attach the matching slice via `$filter`.',
  category: 'Composition',
  kind: 'transform' as const,
  ...demo,
  source,
};
