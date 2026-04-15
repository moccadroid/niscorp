import type { RecipeStory } from '../../story-types';
import * as recipe from './plain-completion.recipe';

export const plainCompletionStory: RecipeStory = {
  id: 'plain-completion',
  name: 'Plain completion',
  description:
    'The simplest possible signal call. A string in, a string out. No system prompt, no history, no tools, no schema.',
  category: 'Basics',
  kind: 'recipe',
  pitch: {
    headline: 'One builder, one call, any provider.',
    body: 'Signal is a unified LLM client. The same five-line builder hits OpenAI, Groq, OpenRouter, Anthropic, and Google — no per-provider SDKs to learn, no glue code to write. Swap one string and your app speaks to a different model.',
  },
  recipe,
  snapshot: {
    result: {
      response: 'The capital of France is Paris.',
      history: [
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
      ],
      meta: {
        model: 'openai/gpt-oss-120b',
        usage: { inputTokens: 13, outputTokens: 7, totalTokens: 20 },
        durationMs: 412,
        retries: 0,
        toolCalls: [],
        provider: { raw: null, errors: [] },
      },
    },
    capturedAt: '2026-04-08T10:00:00Z',
    capturedWith: { provider: 'groq', model: 'openai/gpt-oss-120b' },
    notes:
      'Illustrative snapshot — your live run will differ in exact wording, latency, and token counts.',
  },
  expected: { contentIncludes: ['Paris'] },
};
