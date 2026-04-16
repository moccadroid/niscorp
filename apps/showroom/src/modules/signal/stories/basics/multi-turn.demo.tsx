import { createSignal, type Message, type SignalResult } from '@niscorp/signal';
import { Pitch } from '@showroom/chrome/pitch';
import { ChatView, type ChatViewInitial } from '@showroom/modules/signal/chat/chat-view';

// `.history()` pre-seeds the conversation — every message in the array
// is sent to the model before the new user input. After the call,
// `result.history` contains the full updated thread; persist it and
// pass it back next turn for stateful chat without glue code.

export const provider = 'groq' as const;
export const model = 'openai/gpt-oss-120b';
export const systemPrompt = 'You are a friendly tutor for new programmers.';
export const userInput = 'Can you give me a tiny example in JavaScript?';

export const seedHistory: Message[] = [
  { role: 'user', content: 'What is a function in programming?' },
  {
    role: 'assistant',
    content:
      'A function is a reusable block of code that performs a specific task. You give it inputs (parameters), it does some work, and optionally returns a value.',
  },
];

export const complete = (
  apiKey: string,
  input: string,
  history: Message[] = seedHistory,
  client?: unknown,
): Promise<SignalResult<string>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .systemPrompt(systemPrompt)
    .history(history)
    .complete(input);

export const snapshot = {
  result: {
    response:
      'Sure! Here is a simple function that adds two numbers:\n\n```js\nfunction add(a, b) {\n  return a + b;\n}\n\nconsole.log(add(2, 3)); // 5\n```\n\nThe function `add` takes two parameters and returns their sum.',
    history: [
      { role: 'system', content: systemPrompt },
      ...seedHistory,
      { role: 'user', content: userInput },
      {
        role: 'assistant',
        content:
          'Sure! Here is a simple function that adds two numbers:\n\n```js\nfunction add(a, b) {\n  return a + b;\n}\n\nconsole.log(add(2, 3)); // 5\n```\n\nThe function `add` takes two parameters and returns their sum.',
      },
    ] as Message[],
    meta: {
      model,
      usage: { inputTokens: 73, outputTokens: 65, totalTokens: 138 },
      durationMs: 891,
      retries: 0,
      toolCalls: [],
      provider: { raw: null, errors: [] },
    },
  } as SignalResult<string>,
  capturedAt: '2026-04-08T10:00:00Z',
  capturedWith: { provider: 'groq', model },
};

const initial: ChatViewInitial = {
  provider,
  model,
  systemPrompt,
  history: snapshot.result.history,
  initialInput: '',
  allowProviderChange: false,
  complete,
};

export const Demo = () => (
  <>
    <Pitch
      headline="Stateful chats without the boilerplate."
      body="Pass an array of past messages to .history() and the next .complete() picks up the thread. Signal returns the full updated history on every result, so persisting and rehydrating a conversation is just push the new messages and call again."
    />
    <ChatView initial={initial} />
  </>
);
