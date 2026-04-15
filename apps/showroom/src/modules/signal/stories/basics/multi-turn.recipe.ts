import { createSignal, type Message, type SignalResult } from '@niscorp/signal';

// `.history()` pre-seeds the conversation — every message in the array
// is sent to the model before the new user input. After the call,
// `result.history` contains the full updated thread; persist it and
// pass it back next turn for stateful chat without glue code.

export const provider = 'groq' as const;
export const model = 'openai/gpt-oss-120b';
export const systemPrompt = 'You are a friendly tutor for new programmers.';
export const userInput = 'Can you give me a tiny example in JavaScript?';

// Prior turns already on the record when the chat loads.
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
  client?: unknown, // browser bundler workaround; omit in Node
): Promise<SignalResult<string>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .systemPrompt(systemPrompt)
    .history(history)
    .complete(input);
