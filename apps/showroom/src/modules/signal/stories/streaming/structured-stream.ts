import { z } from 'zod';
import type { StreamStory } from '../../story-types';

const ResponseSchema = z.object({
  widget: z.object({
    type: z.string(),
    title: z.string(),
    icon: z.string(),
  }),
  response: z.string(),
  reasoning: z.string(),
  meta: z.object({
    confidence: z.number(),
    sources: z.number(),
  }),
});

export const structuredStreamStory: StreamStory = {
  id: 'structured-stream',
  name: 'Signal + Solid streaming',
  description: 'signal.stream() pipes text deltas into solid.createStream(). Structured fields fill in live, with full type safety and validation.',
  category: 'Streaming',
  kind: 'stream',
  pitch: {
    headline: 'Structured output, streaming, always valid.',
    body: "This is the full stack: signal handles the LLM connection, retry, and abort. Solid handles the structural invariant — every field is type-checked at value-open, bad values are rejected, and current() is always safe to render. The consumer just pipes text events into solid.write(). Two libraries, zero glue code, one for-await loop.",
  },
  setup: {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    systemPrompt: 'You are a helpful assistant that responds with structured JSON. Always respond with a JSON object matching the schema provided. Write thorough, detailed responses — at least 3-4 paragraphs for the response field and 2-3 paragraphs for reasoning.',
    schema: ResponseSchema,
    input: 'Explain the relationship between gut microbiome diversity and mental health outcomes. Cover the gut-brain axis, key bacterial strains involved, dietary factors, and recent clinical findings. Respond as a widget card with detailed reasoning.',
  },
  solid: {
    schema: ResponseSchema,
    initial: {
      widget: { type: '', title: '', icon: '' },
      response: '',
      reasoning: '',
      meta: { confidence: 0, sources: 0 },
    },
    selectPaths: ['widget', 'response', 'reasoning', 'meta'],
  },
  code: `import { createSignal } from '@niscorp/signal';
import { createStream } from '@niscorp/solid';

const schema = z.object({
  widget: z.object({ type: z.string(), title: z.string(), icon: z.string() }),
  response: z.string(),
  reasoning: z.string(),
  meta: z.object({ confidence: z.number(), sources: z.number() }),
});

const sig = createSignal('groq')
  .model('llama-3.3-70b-versatile')
  .schema(schema);

let solid = createStream({ schema, initial });

for await (const ev of sig.stream(userMessage)) {
  if (ev.type === 'text')  solid.write(ev.text);
  if (ev.type === 'retry') {
    solid.destroy();
    solid = createStream({ schema, initial });
  }
  if (ev.type === 'done') {
    solid.close();
    // ev.response is Zod-validated; solid.current() is shape-valid
  }
}

// React to subtrees as they finalize — before the full stream ends
solid.select('widget').onFinal((widget) => renderCard(widget));
solid.select('response').on((text) => updateResponseText(text));`,
};
