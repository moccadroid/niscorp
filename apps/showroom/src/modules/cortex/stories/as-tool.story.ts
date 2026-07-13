import * as demo from './as-tool.demo';
import source from './as-tool.demo?raw';

export const story = {
  id: 'as-tool',
  name: 'Agents as tools',
  description:
    'asTool(agent) turns an agent into an ordinary tool — no plan interpreter. The child run\'s events forward into the parent stream with a nested agentPath; its envelope maps to the tool result.',
  category: 'Composition',
  kind: 'compose' as const,
  ...demo,
  source,
};
