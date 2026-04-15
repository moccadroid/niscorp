import * as demo from './ref.demo';
import source from './ref.demo?raw';

export const story = {
  id: 'ref',
  name: '$ref',
  description: 'Reads a value from the source data by JSONPath. Paths must start with `$.` and address fields by name or array index.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
