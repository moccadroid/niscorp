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
export const model = 'qwen/qwen3.8-27b';
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
  title: 'Classic Spaghetti Carbonara',
  servings: 2,
  ingredients: [
    {
      item: 'Spaghetti',
      amount: '200 g',
    },
    {
      item: 'Pancetta',
      amount: '100 g',
    },
    {
      item: 'Egg yolks',
      amount: '2',
    },
    {
      item: 'Whole eggs',
      amount: '1',
    },
    {
      item: 'Parmesan cheese, grated',
      amount: '50 g',
    },
    {
      item: 'Black pepper, freshly ground',
      amount: '1 tsp',
    },
  ],
  steps: [
    'Cook the spaghetti in a large pot of generously salted boiling water until just one minute shy of al dente.',
    'Reserve about 1 cup of the pasta water before draining the spaghetti.',
    'In a large skillet, cook the pancetta over medium heat until crispy and golden brown, about 5-7 minutes.',
    'In a large bowl, whisk together the egg yolks, whole eggs, grated cheese, and black pepper until well combined.',
    'Add the cooked spaghetti to the skillet with the pancetta and toss to distribute evenly.',
    'Remove the skillet from the heat immediately. Pour the egg and cheese mixture over the pasta.',
    'Toss rapidly and continuously, adding reserved pasta water a splash at a time, until the egg emulsifies into a creamy sauce that coats the pasta. The residual heat should cook the eggs without scrambling them.',
    'Serve immediately with extra grated cheese and a final crack of black pepper.',
  ],
  tags: [
    'Italian',
    'Classic',
    'Pasta',
  ],
};

// Captured from a live run — `model` on Groq, 2026-09-24. Yours will differ in
// wording, latency and token counts. Seeded as the opening turns of the chat.
export const snapshot = {
  result: {
    response: snapshotResponse,
    history: [
      {
        role: 'user',
        content: 'Give me a recipe for classic spaghetti carbonara for 2 people.',
      },
      {
        role: 'system',
        content: 'OUTPUT SCHEMA: your final reply must be ONLY a JSON value matching this schema — raw JSON, no prose, no code fences:\n{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"title":{"type":"string","description":"Name of the dish."},"servings":{"type":"integer","exclusiveMinimum":0,"maximum":9007199254740991,"description":"Number of servings."},"ingredients":{"type":"array","items":{"type":"object","properties":{"item":{"type":"string"},"amount":{"type":"string","description":"Quantity with unit, e.g. \\"2 cups\\"."}},"required":["item","amount"],"additionalProperties":false}},"steps":{"type":"array","items":{"type":"string"},"description":"Ordered cooking steps."},"tags":{"type":"array","items":{"type":"string"},"description":"Cuisine / dietary tags."}},"required":["title","servings","ingredients","steps","tags"],"additionalProperties":false}',
      },
      {
        role: 'assistant',
        content: '{\n  "title": "Classic Spaghetti Carbonara",\n  "servings": 2,\n  "ingredients": [\n    {\n      "item": "Spaghetti",\n      "amount": "200 g"\n    },\n    {\n      "item": "Pancetta",\n      "amount": "100 g"\n    },\n    {\n      "item": "Egg yolks",\n      "amount": "2"\n    },\n    {\n      "item": "Whole eggs",\n      "amount": "1"\n    },\n    {\n      "item": "Parmesan cheese, grated",\n      "amount": "50 g"\n    },\n    {\n      "item": "Black pepper, freshly ground",\n      "amount": "1 tsp"\n    }\n  ],\n  "steps": [\n    "Cook the spaghetti in a large pot of generously salted boiling water until just one minute shy of al dente.",\n    "Reserve about 1 cup of the pasta water before draining the spaghetti.",\n    "In a large skillet, cook the pancetta over medium heat until crispy and golden brown, about 5-7 minutes.",\n    "In a large bowl, whisk together the egg yolks, whole eggs, grated cheese, and black pepper until well combined.",\n    "Add the cooked spaghetti to the skillet with the pancetta and toss to distribute evenly.",\n    "Remove the skillet from the heat immediately. Pour the egg and cheese mixture over the pasta.",\n    "Toss rapidly and continuously, adding reserved pasta water a splash at a time, until the egg emulsifies into a creamy sauce that coats the pasta. The residual heat should cook the eggs without scrambling them.",\n    "Serve immediately with extra grated cheese and a final crack of black pepper."\n  ],\n  "tags": [\n    "Italian",\n    "Classic",\n    "Pasta"\n  ]\n}',
      },
    ] as Message[],
    meta: {
      model,
      usage: {
        inputTokens: 247,
        outputTokens: 427,
        totalTokens: 674,
      },
      durationMs: 935,
      retries: 0,
      toolCalls: [],
      provider: { raw: null, errors: [] },
    },
  } as SignalResult<Recipe>,
  capturedAt: '2026-09-24T01:17:00+02:00',
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
