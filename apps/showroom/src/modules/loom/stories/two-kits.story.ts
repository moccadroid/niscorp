import * as demo from './two-kits.demo';
import source from './two-kits.demo?raw';

export const story = {
  id: 'two-kits',
  name: 'Two Kits',
  description:
    'One compiled definition, two widget kits. The compiler emits abstract roles; the registry supplies the components. Swapping the kit changes the pixels without touching the schema or the compiler — see the identical Definition tab.',
  category: 'Resolver',
  kind: 'resolver' as const,
  ...demo,
  source,
};
