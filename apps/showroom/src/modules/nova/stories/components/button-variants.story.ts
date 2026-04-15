import { Demo } from './button-variants.demo';
import source from './button-variants.demo?raw';

export const story = {
  id: 'button-variants',
  name: 'Button variants',
  description: 'A row of Buttons covering each variant plus a disabled state.',
  category: 'Components',
  kind: 'layout' as const,
  Demo,
  source,
};
