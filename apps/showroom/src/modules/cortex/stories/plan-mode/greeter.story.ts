import * as demo from './greeter.demo';
import source from './greeter.demo?raw';

export const story = {
  id: 'plan-mode.greeter',
  name: 'Single-tick greeter',
  description:
    'The smallest possible plan-mode demo. The agent returns a one-element plan with just a `final` node. Shows the ActionPlan contract at minimum, no tools, no delegation, one tick.',
  category: 'Single-tick finalize',
  kind: 'plan-mode' as const,
  ...demo,
  source,
};
