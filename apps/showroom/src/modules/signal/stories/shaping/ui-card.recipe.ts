import { z } from 'zod';
import { createSignal, type Message, type SignalResult } from '@niscorp/signal';

// Structured output IS your UI. Mirror your component's props in
// the schema and drop `result.response` straight into JSX:
//   <Card {...result.response} />
//
// Enum fields tell the model what's allowed — it won't invent a
// fifth `tone`. `.describe()` on each field is part of the schema
// the model sees; use it to hint intent (e.g. "2-3 sentences of
// detail", "pill-shaped tags").

export const schema = z.object({
  title: z.string().describe('Headline of the card.'),
  subtitle: z.string().describe('Short supporting line.'),
  body: z.string().describe('Two or three sentences of detail.'),
  badges: z.array(
    z.object({
      label: z.string(),
      tone: z.enum(['neutral', 'positive', 'warning', 'danger']),
    }),
  ),
  actions: z.array(
    z.object({
      label: z.string().describe('Button text.'),
      intent: z.enum(['primary', 'secondary']).describe('Button style.'),
    }),
  ),
});

export type Card = z.infer<typeof schema>;

export const provider = 'groq' as const;
export const model = 'openai/gpt-oss-120b';
export const systemPrompt =
  'You generate UI cards. Pick badges and actions that genuinely fit the topic. Keep the body to 2-3 sentences.';
export const userInput = 'Show me a card recommending a weekend hiking trail near San Francisco.';

export const complete = (
  apiKey: string,
  input: string,
  history: Message[] = [],
  client?: unknown, // browser bundler workaround; omit in Node
): Promise<SignalResult<Card>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .systemPrompt(systemPrompt)
    .schema(schema)
    .history(history)
    .complete(input);
