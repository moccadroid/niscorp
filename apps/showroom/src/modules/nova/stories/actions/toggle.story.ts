import * as demo from './toggle.demo';
import source from './toggle.demo?raw';

export const story = {
  id: 'toggle',
  name: 'Toggle',
  description:
    'The `toggle` op flips a boolean and an `if/then/else` swaps the visible Text between a green "Enabled" and a red "Disabled".',
  category: 'Basics',
  kind: 'action' as const,
  ...demo,
  source,
};
