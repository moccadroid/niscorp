import { z } from 'zod';
import { createSignal, defineTool, type Message, type SignalResult } from '@niscorp/signal';
import { Pitch } from '@showroom/chrome/pitch';
import { ChatView, type ChatViewInitial } from '@showroom/modules/signal/chat/chat-view';

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
export const model = 'qwen/qwen3.8-27b';
export const tools = [weatherTool];
export const userInput = "What's the weather like in Paris right now?";

export const complete = (
  apiKey: string,
  input: string,
  history: Message[] = [],
  client?: unknown,
): Promise<SignalResult<string>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .tools(tools)
    .history(history)
    .complete(input);

// Captured from a live run — `model` on Groq, 2026-09-24. Yours will differ in
// wording, latency and token counts. Seeded as the opening turns of the chat.
export const snapshot = {
  result: {
    response: 'It\'s 18°C (about 64°F) and partly cloudy in Paris right now.',
    history: [
      {
        role: 'user',
        content: 'What\'s the weather like in Paris right now?',
      },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: '9ejqws5mz',
            name: 'get_weather',
            args: '{"city":"Paris"}',
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: '9ejqws5mz',
        name: 'get_weather',
        content: '{"city":"Paris","temperature":18,"condition":"partly cloudy"}',
      },
      {
        role: 'assistant',
        content: 'It\'s 18°C (about 64°F) and partly cloudy in Paris right now.',
      },
    ] as Message[],
    meta: {
      model,
      usage: {
        inputTokens: 705,
        outputTokens: 48,
        totalTokens: 753,
      },
      durationMs: 287,
      retries: 0,
      toolCalls: [
        {
          name: 'get_weather',
          args: {
            city: 'Paris',
          },
          result: {
            city: 'Paris',
            temperature: 18,
            condition: 'partly cloudy',
          },
          durationMs: 0,
        },
      ],
      provider: { raw: null, errors: [] },
    },
  } as SignalResult<string>,
  capturedAt: '2026-09-24T01:17:00+02:00',
  capturedWith: { provider: 'groq', model },
};

const initial: ChatViewInitial = {
  provider,
  model,
  tools,
  history: snapshot.result.history,
  initialInput: '',
  allowProviderChange: false,
  complete,
};

export const Demo = () => (
  <>
    <Pitch
      headline="Function calling that runs itself."
      body="Define a tool with a Zod schema and a plain function. Signal handles the entire model→tool→model loop: it converts your schema to JSON-Schema for the provider, executes the tool when the model asks, feeds the result back, and returns when the model is done. No state machines to write."
    />
    <ChatView initial={initial} />
  </>
);
