import * as demo from './plain-completion.demo';
import source from './plain-completion.demo?raw';

export const story = {
  id: 'plain-completion',
  name: 'Plain completion',
  description:
    'The simplest possible signal call. A string in, a string out. No system prompt, no history, no tools, no schema.',
  category: 'Basics',
  kind: 'recipe' as const,
  ...demo,
  source,
};
