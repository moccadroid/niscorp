import * as demo from './conditional-in-loop.demo';
import source from './conditional-in-loop.demo?raw';

export const story = {
  id: 'structure-conditional-in-loop',
  name: 'Conditional in loop',
  description:
    'Per-item conditionals inside a `for`. Inline `{$if,$then,$else}` picks the Box background; a sibling `if/then/else` swaps the status label.',
  category: 'Structure',
  kind: 'layout' as const,
  ...demo,
  source,
};
