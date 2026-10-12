import type { Message, StepToolCall } from '../types';

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
