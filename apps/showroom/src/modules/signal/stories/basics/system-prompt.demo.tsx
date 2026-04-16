import { createSignal, type Message, type SignalResult } from '@niscorp/signal';
import { Pitch } from '@showroom/chrome/pitch';
import { ChatView, type ChatViewInitial } from '@showroom/modules/signal/chat/chat-view';

// `.systemPrompt()` sets role/tone once. Every `.complete()` on this
// builder inherits it — no prompt-templating library, no string
// concatenation into the user input. Swap providers without rewriting.

export const provider = 'groq' as const;
export const model = 'openai/gpt-oss-120b';
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

export const snapshot = {
  result: {
    response: 'Endless silver waves\nWhisper secrets to the shore\nMoon counts every tide',
    history: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput },
      {
        role: 'assistant',
        content: 'Endless silver waves\nWhisper secrets to the shore\nMoon counts every tide',
      },
    ] as Message[],
    meta: {
      model,
      usage: { inputTokens: 28, outputTokens: 19, totalTokens: 47 },
      durationMs: 624,
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
      headline="Personality, role, constraints — one chained call."
      body="A system prompt is the cheapest way to get consistent behavior. Set it once on the builder and every subsequent completion inherits it. No prompt-templating libraries, no string concatenation glue."
    />
    <ChatView initial={initial} />
  </>
);
