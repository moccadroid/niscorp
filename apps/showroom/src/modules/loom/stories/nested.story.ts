import * as demo from './nested.demo';
import source from './nested.demo?raw';

export const story = {
  id: 'nested',
  name: 'Nested',
  description:
    'A nested object. The compiler recurses — an object property becomes its own group of wrapped fields bound to dotted paths like `address.street`, and the document stays correctly nested.',
  category: 'Structure',
  kind: 'structure' as const,
  ...demo,
  source,
};
