import * as demo from './calculated-fields.demo';
import source from './calculated-fields.demo?raw';

export const story = {
  id: 'calculated-fields',
  name: 'Calculated fields',
  description: 'Build derived fields from raw input. Cart line items → subtotal, tax, total. Uses `$with` to bind the subtotal once and reuse it via `$var`, then `$round` to fix the precision.',
  category: 'Composition',
  kind: 'transform' as const,
  ...demo,
  source,
};
