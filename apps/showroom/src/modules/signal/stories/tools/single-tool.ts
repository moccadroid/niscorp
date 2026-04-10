import { z } from 'zod';
import { defineTool } from '@niscorp/signal';
import type { RecipeStory } from '../../story-types';

// A fake weather tool. Signal's runtime calls execute() with the model's
// chosen arguments and feeds the result back into the conversation.
const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  input: z.object({
    city: z.string().describe('City name, e.g. "Paris" or "Tokyo".'),
  }),
  execute: ({ city }) => ({ city, temperature: 18, condition: 'partly cloudy' }),
});

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
  setup: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    tools: [weatherTool],
    input: "What's the weather like in Paris right now?",
  },
  code: `import { z } from 'zod';
import { createSignal, defineTool } from '@niscorp/signal';

const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  input: z.object({
    city: z.string().describe('City name, e.g. "Paris" or "Tokyo".'),
  }),
  execute: async ({ city }) => {
    // Real implementation would hit an API. The return value is
    // serialized and fed back to the model as a tool result message.
    return { city, temperature: 18, condition: 'partly cloudy' };
  },
});

const result = await createSignal('groq')
  .apiKey(process.env.GROQ_API_KEY!)
  .model('openai/gpt-oss-120b')
  .tools([weatherTool])
  .complete("What's the weather like in Paris right now?");

console.log(result.response);
// → "It's 18°C and partly cloudy in Paris right now."

console.log(result.meta.toolCalls);
// → [{ name: 'get_weather', args: { city: 'Paris' }, result: {...}, durationMs: 12 }]
`,
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
    notes:
      'Illustrative snapshot. The fake weather tool always returns 18°C partly cloudy in Paris.',
  },
  expected: {
    contentIncludes: ['Paris', '18'],
    minToolCalls: 1,
  },
};
