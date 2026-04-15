import type { RecipeStory } from '../../story-types';
import * as recipe from './single-tool.recipe';

export const singleToolStory: RecipeStory = {
  id: 'single-tool',
  name: 'Single tool call',
  description:
    "The model decides to call a tool, signal runs it, and the model continues with the result. The full roundtrip lives in result.history; tool execution metadata is in result.meta.toolCalls.",
  category: 'Tools',
  kind: 'recipe',
  pitch: {
    headline: 'Function calling that runs itself.',
    body: "Define a tool with a Zod schema and a plain function. Signal handles the entire model→tool→model loop: it converts your schema to JSON-Schema for the provider, executes the tool when the model asks, feeds the result back, and returns when the model is done. No state machines to write.",
  },
  recipe,
  snapshot: {
    result: {
      response: "It's 18°C and partly cloudy in Paris right now.",
      history: [
        { role: 'user', content: "What's the weather like in Paris right now?" },
        { role: 'assistant', content: '' },
        {
          role: 'tool',
          toolCallId: 'tc_1',
          name: 'get_weather',
          content: '{"city":"Paris","temperature":18,"condition":"partly cloudy"}',
        },
        {
          role: 'assistant',
          content: "It's 18°C and partly cloudy in Paris right now.",
        },
      ],
      meta: {
        model: 'openai/gpt-oss-120b',
        usage: { inputTokens: 87, outputTokens: 24, totalTokens: 111 },
        durationMs: 1834,
        retries: 0,
        toolCalls: [
          {
            name: 'get_weather',
            args: { city: 'Paris' },
            result: { city: 'Paris', temperature: 18, condition: 'partly cloudy' },
            durationMs: 12,
          },
        ],
        provider: { raw: null, errors: [] },
      },
    },
    capturedAt: '2026-04-08T10:00:00Z',
    capturedWith: { provider: 'groq', model: 'openai/gpt-oss-120b' },
    notes: 'Illustrative snapshot. The fake weather tool always returns 18°C partly cloudy in Paris.',
  },
  expected: {
    contentIncludes: ['Paris', '18'],
    minToolCalls: 1,
  },
};
