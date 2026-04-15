import { z } from 'zod';
import { createSignal, type Message, type SignalResult } from '@niscorp/signal';

// `.schema(zodSchema)` constrains the response to a typed shape.
// Signal picks a per-provider strategy — native JSON-schema mode
// where the provider supports it, a tool-calling fallback otherwise.
// Either way, `result.response` is a parsed, validated object — no
// JSON.parse, no try/catch.
//
// The `.describe()` calls on each field are sent to the model as
// part of the schema; treat them as prompt content. The better you
// describe the fields, the less the model guesses wrong.

export const schema = z.object({
  title: z.string().describe('Name of the dish.'),
  servings: z.number().int().positive().describe('Number of servings.'),
  ingredients: z.array(
    z.object({
      item: z.string(),
      amount: z.string().describe('Quantity with unit, e.g. "2 cups".'),
    }),
  ),
  steps: z.array(z.string()).describe('Ordered cooking steps.'),
  tags: z.array(z.string()).describe('Cuisine / dietary tags.'),
});

export type Recipe = z.infer<typeof schema>;

export const provider = 'groq' as const;
export const model = 'openai/gpt-oss-120b';
export const userInput = 'Give me a recipe for classic spaghetti carbonara for 2 people.';

export const complete = (
  apiKey: string,
  input: string,
  history: Message[] = [],
  client?: unknown, // browser bundler workaround; omit in Node
): Promise<SignalResult<Recipe>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .schema(schema)
    .history(history)
    .complete(input);
