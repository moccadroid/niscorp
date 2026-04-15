import { z } from 'zod';
import { createSignal, type Message, type SignalResult } from '@niscorp/signal';

// Two things in one result: a free-form `reply` plus a typed
// `suggestions` array for your UI to render as clickable chips.
//
// Zod constraints (`.max(4)`, `.max(40)`) become part of the schema
// the model sees — you don't post-process, you don't trim, you just
// trust the shape that comes back. That's the whole pitch: guardrails
// at the schema layer instead of at the consumer.

export const schema = z.object({
  reply: z.string().describe('Conversational answer to the user.'),
  suggestions: z
    .array(
      z.object({
        label: z.string().max(40).describe('Short button label, max 40 chars.'),
        prompt: z.string().describe('The full follow-up message to send when clicked.'),
      }),
    )
    .max(4)
    .describe('Up to four suggested follow-up actions.'),
});

export type ReplyWithActions = z.infer<typeof schema>;

export const provider = 'groq' as const;
export const model = 'openai/gpt-oss-120b';
export const systemPrompt =
  'You are a helpful product assistant. Always include 2-4 follow-up suggestions that move the conversation forward.';
export const userInput = 'I just signed up. What should I try first?';

export const complete = (
  apiKey: string,
  input: string,
  history: Message[] = [],
  client?: unknown, // browser bundler workaround; omit in Node
): Promise<SignalResult<ReplyWithActions>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .systemPrompt(systemPrompt)
    .schema(schema)
    .history(history)
    .complete(input);
