import { z } from 'zod';
import { createSignal, type Message, type SignalResult } from '@niscorp/signal';
import { Pitch } from '@showroom/chrome/pitch';
import { ChatView, type ChatViewInitial } from '@showroom/modules/signal/chat/chat-view';

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
  client?: unknown,
): Promise<SignalResult<Recipe>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .schema(schema)
    .history(history)
    .complete(input);

const snapshotResponse: Recipe = {
  title: 'Spaghetti Carbonara',
  servings: 2,
  ingredients: [
    { item: 'spaghetti', amount: '200 g' },
    { item: 'guanciale (or pancetta)', amount: '100 g' },
    { item: 'large egg yolks', amount: '3' },
    { item: 'pecorino romano, finely grated', amount: '50 g' },
    { item: 'freshly cracked black pepper', amount: 'to taste' },
    { item: 'salt', amount: 'for the pasta water' },
  ],
  steps: [
    'Bring a large pot of well-salted water to a boil and cook the spaghetti until al dente.',
    'While the pasta cooks, dice the guanciale and render it in a cold dry pan over medium heat until crisp.',
    'In a bowl, whisk the egg yolks with the pecorino and a generous amount of black pepper.',
    'Reserve a cup of pasta water, then drain the spaghetti and add it to the pan with the guanciale off the heat.',
    'Pour in the egg mixture and toss vigorously, loosening with splashes of pasta water until silky and creamy.',
    'Plate immediately, top with extra pecorino and pepper, and serve.',
  ],
  tags: ['italian', 'pasta', 'quick', 'classic'],
};

export const snapshot = {
  result: {
    response: snapshotResponse,
    history: [
      { role: 'user', content: userInput },
      { role: 'assistant', content: JSON.stringify(snapshotResponse) },
    ] as Message[],
    meta: {
      model,
      usage: { inputTokens: 96, outputTokens: 178, totalTokens: 274 },
      durationMs: 924,
      retries: 0,
      toolCalls: [],
      provider: { raw: null, errors: [] },
    },
  } as SignalResult<Recipe>,
  capturedAt: '2026-04-08T10:00:00Z',
  capturedWith: { provider: 'groq', model },
};

export const structuredRender = 'json' as const;

const initial: ChatViewInitial = {
  provider,
  model,
  schema,
  history: snapshot.result.history,
  initialInput: '',
  allowProviderChange: false,
  structuredRender,
  seededStructuredFinal: snapshotResponse,
  complete,
};

export const Demo = () => (
  <>
    <Pitch
      headline="Define a Zod schema. Get a typed object back. That's it."
      body="No prompt engineering, no JSON.parse(), no validation glue. Hand signal a Zod schema and result.response is a fully-typed parsed object — even on providers that don't natively support JSON-schema mode (signal falls back to a tool-calling strategy automatically)."
    />
    <ChatView initial={initial} />
  </>
);
