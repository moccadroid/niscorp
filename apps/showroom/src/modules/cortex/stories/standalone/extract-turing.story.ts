import * as demo from './extract-turing.demo';
import source from './extract-turing.demo?raw';

export const story = {
  id: 'standalone.extract.turing',
  name: 'Alan Turing fragment',
  description:
    'A shorter, less explicit text. Tests how the agent handles missing fields — they should come back as null, not invented.',
  category: 'Structured output (generic)',
  kind: 'standalone' as const,
  ...demo,
  source,
};
