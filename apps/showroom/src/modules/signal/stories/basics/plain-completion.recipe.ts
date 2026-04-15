import { createSignal, type Message, type SignalResult } from '@niscorp/signal';

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
  client?: unknown, // browser bundler workaround; omit in Node
): Promise<SignalResult<string>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .history(history)
    .complete(input);
