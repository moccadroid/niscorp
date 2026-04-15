import { createSignal, type Message, type SignalResult } from '@niscorp/signal';

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
  client?: unknown, // browser bundler workaround; omit in Node
): Promise<SignalResult<string>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .systemPrompt(systemPrompt)
    .history(history)
    .complete(input);
