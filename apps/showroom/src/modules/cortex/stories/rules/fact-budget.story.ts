import * as demo from './fact-budget.demo';
import source from './fact-budget.demo?raw';

export const story = {
  id: 'rules.budget-guardian',
  name: 'Budget guardian',
  description:
    "A fact-finding agent is given a research task. A rule counts observations and injects a budget warning at 3, then aborts at 5. Demonstrates how rules can enforce resource limits without touching the agent's code.",
  category: 'Resource control',
  kind: 'rules' as const,
  ...demo,
  source,
};
