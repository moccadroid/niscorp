import * as demo from './budget-fail.demo';
import source from './budget-fail.demo?raw';

export const story = {
  id: 'tool-use.weather.budget-fail',
  name: 'Weather + tight budget (denied)',
  description:
    "Same agent, same prompt. The only difference: the manifold is given a tight per-run token budget. Cortex's tool-loop gate fires after the first iteration (which already exceeded the cap) and denies further tool calls. The run is supposed to fail — pass means the gate fired as expected.",
  category: 'Policy & budgets',
  kind: 'tool-use' as const,
  ...demo,
  source,
};
