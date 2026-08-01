import type { Message, StepToolCall } from '../types';

// What a call cost, when the provider will not say.
//
// Two paths need this and neither gets a number from the wire:
//
//   the streamed frame never arrived — OpenAI-compatible streams send usage
//   after the last content chunk and are not reliable about it. The same
//   provider emits it twice on one call and omits it on the next.
//
//   the generation was REJECTED and recovered — the 400 carries the model's
//   attempt in `failed_generation` and no usage at all, though the provider
//   plainly processed the request and billed for it.
//
// Heuristic, ~4 characters per token plus a per-message overhead — the same one
// `count()` uses. Every result built from this is marked `reported: false`, so a
// consumer can tell a measurement from a reckoning. An estimate within a few
// percent is worth far more than a zero that reads as free.
const CHARS_PER_TOKEN = 4;
const PER_MESSAGE = 4;

const lengthOf = (content: unknown): number => (typeof content === 'string' ? content.length : JSON.stringify(content ?? '').length);

export const estimateUsage = (
  messages: readonly Message[],
  content: string,
  toolCalls: readonly StepToolCall[] = [],
): { inputTokens: number; outputTokens: number; totalTokens: number; reported: false } => {
  let inputTokens = 0;
  for (const message of messages) inputTokens += PER_MESSAGE + Math.ceil(lengthOf(message.content) / CHARS_PER_TOKEN);
  const emitted = content + toolCalls.map((call) => `${call.name}${JSON.stringify(call.args)}`).join('');
  const outputTokens = Math.ceil(emitted.length / CHARS_PER_TOKEN);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, reported: false };
};
