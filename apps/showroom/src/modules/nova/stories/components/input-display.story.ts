import { Demo } from './input-display.demo';
import source from './input-display.demo?raw';

export const story = {
  id: 'input-display',
  name: 'Input (display)',
  description:
    'One-way `value` binding on Input via `{{…}}` templates (no `model`, so typing does not write back). Three inputs display fields of the data tree, plus a disabled input showing the read-only style.',
  category: 'Components',
  kind: 'layout' as const,
  Demo,
  source,
};
