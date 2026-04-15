import type { RecipeStory } from '../../story-types';
import * as recipe from './system-prompt.recipe';

export const systemPromptStory: RecipeStory = {
  id: 'system-prompt',
  name: 'System prompt',
  description:
    'Steer the model with a system prompt before the user input. Same plain completion shape, but the system prompt sets the tone and constraints for every response.',
  category: 'Basics',
  kind: 'recipe',
  pitch: {
    headline: 'Personality, role, constraints — one chained call.',
    body: 'A system prompt is the cheapest way to get consistent behavior. Set it once on the builder and every subsequent completion inherits it. No prompt-templating libraries, no string concatenation glue.',
  },
  recipe,
  snapshot: {
    result: {
      response: 'Endless silver waves\nWhisper secrets to the shore\nMoon counts every tide',
      history: [
        { role: 'system', content: 'You are a poet. Reply only in haiku (5/7/5 syllables).' },
        { role: 'user', content: 'Describe the ocean.' },
        { role: 'assistant', content: 'Endless silver waves\nWhisper secrets to the shore\nMoon counts every tide' },
      ],
      meta: {
        model: 'openai/gpt-oss-120b',
        usage: { inputTokens: 28, outputTokens: 19, totalTokens: 47 },
        durationMs: 624,
        retries: 0,
        toolCalls: [],
        provider: { raw: null, errors: [] },
      },
    },
    capturedAt: '2026-04-08T10:00:00Z',
    capturedWith: { provider: 'groq', model: 'openai/gpt-oss-120b' },
    notes: 'Illustrative snapshot — the model rarely produces the same haiku twice.',
  },
  expected: { contentIncludes: ['waves'] },
};
