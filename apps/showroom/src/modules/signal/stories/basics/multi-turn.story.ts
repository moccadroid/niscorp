import * as demo from './multi-turn.demo';
import source from './multi-turn.demo?raw';

export const story = {
  id: 'multi-turn',
  name: 'Multi-turn conversation',
  description:
    'Pre-seed the conversation with .history() to give the model context from prior turns. The next user input continues the same conversation.',
  category: 'Basics',
  kind: 'recipe' as const,
  ...demo,
  source,
};
