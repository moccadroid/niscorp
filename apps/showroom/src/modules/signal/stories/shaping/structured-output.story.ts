import * as demo from './structured-output.demo';
import source from './structured-output.demo?raw';

export const story = {
  id: 'structured-output',
  name: 'Structured output',
  description:
    'Use .schema(zodSchema) to constrain the response to a typed object. Signal handles native JSON-schema mode where supported and falls back to a tool-calling-based strategy otherwise. The result.response is fully typed and validated.',
  category: 'Shaping',
  kind: 'recipe' as const,
  ...demo,
  source,
};
