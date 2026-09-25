import { createSignal, type Message, type SignalResult } from '@niscorp/signal';
import { Pitch } from '@showroom/chrome/pitch';
import { ChatView, type ChatViewInitial } from '@showroom/modules/signal/chat/chat-view';

// `.history()` pre-seeds the conversation — every message in the array
// is sent to the model before the new user input. After the call,
// `result.history` contains the full updated thread; persist it and
// pass it back next turn for stateful chat without glue code.

export const provider = 'groq' as const;
export const model = 'qwen/qwen3.8-27b';
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

// Captured from a live run — `model` on Groq, 2026-09-24. Yours will differ in
// wording, latency and token counts. Seeded as the opening turns of the chat.
export const snapshot = {
  result: {
    response: 'Here is a small JavaScript function that greets a person by name:\n\n```javascript\nfunction greet(name) {\n  console.log("Hello, " + name);\n}\n\n// Calling the function with an argument\ngreet("Alice"); // Outputs: Hello, Alice\ngreet("Bob");   // Outputs: Hello, Bob\n```\n\nIn this example:\n- `name` is the **parameter** (the input).\n- The code inside the curly braces `{}` is the **function body** (what it does).\n- We **call** (or execute) the function by writing `greet(...)` followed by the actual value we want to pass in.',
    history: [
      {
        role: 'system',
        content: 'You are a friendly tutor for new programmers.',
      },
      {
        role: 'user',
        content: 'What is a function in programming?',
      },
      {
        role: 'assistant',
        content: 'A function is a reusable block of code that performs a specific task. You give it inputs (parameters), it does some work, and optionally returns a value.',
      },
      {
        role: 'user',
        content: 'Can you give me a tiny example in JavaScript?',
      },
      {
        role: 'assistant',
        content: 'Here is a small JavaScript function that greets a person by name:\n\n```javascript\nfunction greet(name) {\n  console.log("Hello, " + name);\n}\n\n// Calling the function with an argument\ngreet("Alice"); // Outputs: Hello, Alice\ngreet("Bob");   // Outputs: Hello, Bob\n```\n\nIn this example:\n- `name` is the **parameter** (the input).\n- The code inside the curly braces `{}` is the **function body** (what it does).\n- We **call** (or execute) the function by writing `greet(...)` followed by the actual value we want to pass in.',
      },
    ] as Message[],
    meta: {
      model,
      usage: {
        inputTokens: 89,
        outputTokens: 142,
        totalTokens: 231,
      },
      durationMs: 466,
      retries: 0,
      toolCalls: [],
      provider: { raw: null, errors: [] },
    },
  } as SignalResult<string>,
  capturedAt: '2026-09-24T01:17:00+02:00',
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
