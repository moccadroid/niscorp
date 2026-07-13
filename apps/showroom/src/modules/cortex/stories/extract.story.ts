import * as demo from './extract.demo';
import source from './extract.demo?raw';

export const story = {
  id: 'extract',
  name: 'Structured extraction',
  description:
    'A Zod schema types the envelope\'s `data` end-to-end. Invalid output comes back to the model as the respond tool\'s error result — a correction inside the same run, never a re-run.',
  category: 'Basics',
  kind: 'basics' as const,
  ...demo,
  source,
};
