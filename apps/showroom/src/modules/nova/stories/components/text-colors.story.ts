import { Demo } from './text-colors.demo';
import source from './text-colors.demo?raw';

export const story = {
  id: 'text-colors',
  name: 'Text colors',
  description:
    'Prop values support template interpolation — `color` reads from `{{$.colors.X}}` instead of a literal. Theme components by writing colours into the data tree.',
  category: 'Components',
  kind: 'layout' as const,
  Demo,
  source,
};
