import type { StreamStory } from '../../story-types';
import * as recipe from './structured-stream.recipe';

export const structuredStreamStory: StreamStory = {
  id: 'structured-stream',
  name: 'Signal + Solid streaming',
  description:
    'signal.stream() pipes text deltas into solid.createStream(). Structured fields fill in live, with full type safety and validation.',
  category: 'Streaming',
  kind: 'stream',
  pitch: {
    headline: 'Structured output, streaming, always valid.',
    body: "This is the full stack: signal handles the LLM connection, retry, and abort. Solid handles the structural invariant — every field is type-checked at value-open, bad values are rejected, and current() is always safe to render. The consumer just pipes text events into solid.write(). Two libraries, zero glue code, one for-await loop.",
  },
  recipe,
};
