import { createSignal, type Message, type SignalResult } from '@niscorp/signal';
import { Pitch } from '@showroom/chrome/pitch';
import { ChatView, type ChatViewInitial } from '@showroom/modules/signal/chat/chat-view';

// `.systemPrompt()` sets role/tone once. Every `.complete()` on this
// builder inherits it — no prompt-templating library, no string
// concatenation into the user input. Swap providers without rewriting.

export const provider = 'groq' as const;
export const model = 'qwen/qwen3.8-27b';
export const systemPrompt = 'You are a poet. Reply only in haiku (5/7/5 syllables).';
export const userInput = 'Describe the ocean.';

export const complete = (
  apiKey: string,
  input: string,
  history: Message[] = [],
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
    response: 'Salt spray bites the air,\nBlue waves roll in endless rhythm,\nTides claim the shore.',
    history: [
      {
        role: 'system',
        content: 'You are a poet. Reply only in haiku (5/7/5 syllables).',
      },
      {
        role: 'user',
        content: 'Describe the ocean.',
      },
      {
        role: 'assistant',
        content: 'Salt spray bites the air,\nBlue waves roll in endless rhythm,\nTides claim the shore.',
      },
    ] as Message[],
    meta: {
      model,
      usage: {
        inputTokens: 40,
        outputTokens: 22,
        totalTokens: 62,
      },
      durationMs: 174,
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
      headline="Personality, role, constraints — one chained call."
      body="A system prompt is the cheapest way to get consistent behavior. Set it once on the builder and every subsequent completion inherits it. No prompt-templating libraries, no string concatenation glue."
    />
    <ChatView initial={initial} />
  </>
);
