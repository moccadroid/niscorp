import * as demo from './quick-research.demo';
import source from './quick-research.demo?raw';

export const story = {
  id: 'rules.happy-path',
  name: 'Happy path (rule never fires)',
  description:
    "Same rate-limit rule as Demo 1, but the user asks a simple question that needs only 1-2 tool calls. The rule watches silently and never triggers. Shows that rules are zero-cost when conditions aren't met — they're gravity that only pulls when you drift.",
  category: 'Zero-cost when inactive',
  kind: 'rules' as const,
  ...demo,
  source,
};
