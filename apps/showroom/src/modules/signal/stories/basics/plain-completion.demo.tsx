import { createSignal, type Message, type SignalResult } from '@niscorp/signal';
import { Pitch } from '@showroom/chrome/pitch';
import { ChatView, type ChatViewInitial } from '@showroom/modules/signal/chat/chat-view';

// A minimal signal call. `createSignal(provider)` starts a builder;
// each chained method returns a new Signal (immutable). `.complete()`
// terminates the chain and returns a typed `SignalResult`.
//
// `result.history` comes back containing the full updated thread
// (system + prior turns + your new input + the assistant's reply).
// Persist it as-is and feed it back next turn — that's stateful chat.

export const provider = 'groq' as const;
export const model = 'openai/gpt-oss-120b';
export const userInput = 'What is the capital of France?';

export const complete = (
  apiKey: string,
  input: string,
  history: Message[] = [],
  client?: unknown,
): Promise<SignalResult<string>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .history(history)
    .complete(input);

// Illustrative snapshot — your live run will differ in exact wording,
// latency, and token counts. Seeded as the opening turns of the chat.
export const snapshot = {
  result: {
    response: 'The capital of France is Paris.',
    history: [
      { role: 'user', content: 'What is the capital of France?' },
      { role: 'assistant', content: 'The capital of France is Paris.' },
    ] as Message[],
    meta: {
      model,
      usage: { inputTokens: 13, outputTokens: 7, totalTokens: 20 },
      durationMs: 412,
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
  history: snapshot.result.history,
  initialInput: '',
  allowProviderChange: false,
  complete,
};

export const Demo = () => (
  <>
    <Pitch
      headline="One builder, one call, any provider."
      body="Signal is a unified LLM client. The same five-line builder hits OpenAI, Groq, OpenRouter, Anthropic, and Google — no per-provider SDKs to learn, no glue code to write. Swap one string and your app speaks to a different model."
    />
    <ChatView initial={initial} />
  </>
);
