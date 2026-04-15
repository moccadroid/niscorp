import { z } from 'zod';
import { createSignal, defineTool, type Message, type SignalResult } from '@niscorp/signal';

// Function calling, fully automated. Pass tools via `.tools()`; when
// the model chooses one, signal invokes `execute`, feeds its return
// value back as a tool-result message, and keeps iterating until the
// model finalizes. Every invocation lands in `result.meta.toolCalls`
// with args, return value, and duration.
//
// `execute` can be async — hit a real API, query a database, call
// another service. Zod validates the model's input args before you
// run, so you never see `undefined` where the schema says `string`.

export const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  input: z.object({
    city: z.string().describe('City name, e.g. "Paris" or "Tokyo".'),
  }),
  execute: async ({ city }) => {
    return { city, temperature: 18, condition: 'partly cloudy' };
  },
});

export const provider = 'groq' as const;
export const model = 'openai/gpt-oss-120b';
export const tools = [weatherTool];
export const userInput = "What's the weather like in Paris right now?";

export const complete = (
  apiKey: string,
  input: string,
  history: Message[] = [],
  client?: unknown, // browser bundler workaround; omit in Node
): Promise<SignalResult<string>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .tools(tools)
    .history(history)
    .complete(input);
