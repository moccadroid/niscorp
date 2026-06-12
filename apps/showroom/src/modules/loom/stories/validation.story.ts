import * as demo from './validation.demo';
import source from './validation.demo?raw';

export const story = {
  id: 'validation',
  name: 'Validation',
  description:
    'Loom validates against the real Zod schema. Edit a field to break a constraint (a short username, a bad email, an age under 18) — the message shows inline and clears when fixed. The reported document never carries the errors.',
  category: 'Basics',
  kind: 'basics' as const,
  ...demo,
  source,
};
