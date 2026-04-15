import * as demo from './flat-map.demo';
import source from './flat-map.demo?raw';

export const story = {
  id: 'flat-map',
  name: '$flatMap',
  description: 'Sugar: map over an array where each element produces an array, then flatten one level. Desugars to `$flatten + $map`. Classic for "expand each parent into its children."',
  category: 'Sugar',
  kind: 'transform' as const,
  ...demo,
  source,
};
