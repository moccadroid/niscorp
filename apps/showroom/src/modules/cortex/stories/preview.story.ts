import * as demo from './preview.demo';
import source from './preview.demo?raw';

export const story = {
  id: 'preview',
  name: 'Preview (no model call)',
  description:
    'agent.preview() returns the exact messages, the real tool descriptors (including the synthesized respond tool), the resolved output strategy, and a token estimate — without touching a model. Works without an API key.',
  category: 'Basics',
  kind: 'basics' as const,
  ...demo,
  source,
};
