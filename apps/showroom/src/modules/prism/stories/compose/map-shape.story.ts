import * as demo from './map-shape.demo';
import source from './map-shape.demo?raw';

export const story = {
  id: 'map-shape',
  name: 'Map → shape',
  description: 'Map an array of records into a different shape per element. The body of $map can be a template object — every value inside it is evaluated against the loop scope.',
  category: 'Composition',
  kind: 'transform' as const,
  ...demo,
  source,
};
