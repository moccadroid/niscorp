import * as demo from './replace-wizard.demo';
import source from './replace-wizard.demo?raw';

export const story = {
  id: 'replace-wizard',
  name: 'Replace wizard',
  description:
    'Each Next `replace`s the current step — stack depth stays at 2. A `summary` is pushed underneath step 1, so the final Done pops back to it.',
  category: 'Navigation',
  kind: 'shell' as const,
  ...demo,
  source,
};
