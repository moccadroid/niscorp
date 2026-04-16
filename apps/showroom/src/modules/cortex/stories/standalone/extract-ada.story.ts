import * as demo from './extract-ada.demo';
import source from './extract-ada.demo?raw';

export const story = {
  id: 'standalone.extract.ada',
  name: 'Ada Lovelace bio',
  description:
    'Pull a structured Person record out of a paragraph of free-form text. The simplest Cortex use case: defineAgent + outputSchema, one call, typed result.',
  category: 'Structured output (generic)',
  kind: 'standalone' as const,
  ...demo,
  source,
};
