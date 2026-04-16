import * as demo from './product-summary.demo';
import source from './product-summary.demo?raw';

export const story = {
  id: 'standalone.prism-mapping.product-summary',
  name: 'Product → display card',
  description:
    'Take a raw product record and produce a display card with formatted price and an availability flag.',
  category: 'Structured output (Prism mapping)',
  kind: 'standalone' as const,
  ...demo,
  source,
};
