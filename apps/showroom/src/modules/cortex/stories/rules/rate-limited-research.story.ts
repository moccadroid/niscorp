import * as demo from './rate-limited-research.demo';
import source from './rate-limited-research.demo?raw';

export const story = {
  id: 'rules.tool-rate-limit',
  name: 'Tool rate-limiter',
  description:
    'A declarative rule watches tool call count. After 3 calls it injects a "wrap up" warning into the agent\'s context. After 5 it aborts the run. The agent sees the warning and (usually) finalizes early. Zero code — just a JSON rule.',
  category: 'Declarative steering',
  kind: 'rules' as const,
  ...demo,
  source,
};
