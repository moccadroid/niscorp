import * as demo from './system-prompt.demo';
import source from './system-prompt.demo?raw';

export const story = {
  id: 'system-prompt',
  name: 'System prompt',
  description:
    'Steer the model with a system prompt before the user input. Same plain completion shape, but the system prompt sets the tone and constraints for every response.',
  category: 'Basics',
  kind: 'recipe' as const,
  ...demo,
  source,
};
