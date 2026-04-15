import * as demo from './add.demo';
import source from './add.demo?raw';

export const story = {
  id: 'add',
  name: '$add',
  description: 'Adds two numeric operands. The four binary math ops ($add, $sub, $mul, $div) all take a fixed two-element tuple. Operands can be any expression, not just literals.',
  category: 'Operators',
  kind: 'transform' as const,
  ...demo,
  source,
};
