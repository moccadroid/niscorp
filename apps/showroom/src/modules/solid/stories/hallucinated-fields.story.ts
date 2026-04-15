import * as demo from './hallucinated-fields.demo';
import source from './hallucinated-fields.demo?raw';

export const story = {
  id: 'hallucinated-fields',
  name: 'Hallucinated fields',
  description:
    'The LLM sends wrong types for several fields. Flip between trust / recover / strict to see how solid handles it.',
  category: 'Validation',
  kind: 'stream-demo' as const,
  ...demo,
  source,
};
