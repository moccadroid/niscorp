import { z } from 'zod';
import { createSignal, type Message, type SignalResult } from '@niscorp/signal';
import { Pitch } from '@showroom/chrome/pitch';
import { ChatView, type ChatViewInitial } from '@showroom/modules/signal/chat/chat-view';

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
export const model = 'qwen/qwen3.8-27b';
export const systemPrompt =
  'You generate UI cards. Pick badges and actions that genuinely fit the topic. Keep the body to 2-3 sentences.';
export const userInput = 'Show me a card recommending a weekend hiking trail near San Francisco.';

export const complete = (
  apiKey: string,
  input: string,
  history: Message[] = [],
  client?: unknown,
): Promise<SignalResult<Card>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .systemPrompt(systemPrompt)
    .schema(schema)
    .history(history)
    .complete(input);

const snapshotResponse: Card = {
  title: 'Half Moon Bay & Point Reyes',
  subtitle: 'A scenic 9-mile round trip along the coast.',
  body: 'This moderate trail offers stunning ocean views, wildflower meadows, and chances to spot sea lions. Hike early on a Saturday morning to avoid crowds and catch the morning light on the cliffs. Wear sturdy shoes as the terrain includes rocky sections and soft sand.',
  badges: [
    {
      label: 'Family Friendly',
      tone: 'positive',
    },
    {
      label: 'Moderate Difficulty',
      tone: 'neutral',
    },
    {
      label: 'No Permit Required',
      tone: 'positive',
    },
  ],
  actions: [
    {
      label: 'View Map',
      intent: 'primary',
    },
    {
      label: 'Share with Friends',
      intent: 'secondary',
    },
  ],
};

// Captured from a live run — `model` on Groq, 2026-09-24. Yours will differ in
// wording, latency and token counts. Seeded as the opening turns of the chat.
export const snapshot = {
  result: {
    response: snapshotResponse,
    history: [
      {
        role: 'system',
        content: 'You generate UI cards. Pick badges and actions that genuinely fit the topic. Keep the body to 2-3 sentences.',
      },
      {
        role: 'user',
        content: 'Show me a card recommending a weekend hiking trail near San Francisco.',
      },
      {
        role: 'system',
        content: 'OUTPUT SCHEMA: your final reply must be ONLY a JSON value matching this schema — raw JSON, no prose, no code fences:\n{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"title":{"type":"string","description":"Headline of the card."},"subtitle":{"type":"string","description":"Short supporting line."},"body":{"type":"string","description":"Two or three sentences of detail."},"badges":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string"},"tone":{"type":"string","enum":["neutral","positive","warning","danger"]}},"required":["label","tone"],"additionalProperties":false}},"actions":{"type":"array","items":{"type":"object","properties":{"label":{"type":"string","description":"Button text."},"intent":{"type":"string","enum":["primary","secondary"],"description":"Button style."}},"required":["label","intent"],"additionalProperties":false}}},"required":["title","subtitle","body","badges","actions"],"additionalProperties":false}',
      },
      {
        role: 'assistant',
        content: '{\n  "title": "Half Moon Bay & Point Reyes",\n  "subtitle": "A scenic 9-mile round trip along the coast.",\n  "body": "This moderate trail offers stunning ocean views, wildflower meadows, and chances to spot sea lions. Hike early on a Saturday morning to avoid crowds and catch the morning light on the cliffs. Wear sturdy shoes as the terrain includes rocky sections and soft sand.",\n  "badges": [\n    {\n      "label": "Family Friendly",\n      "tone": "positive"\n    },\n    {\n      "label": "Moderate Difficulty",\n      "tone": "neutral"\n    },\n    {\n      "label": "No Permit Required",\n      "tone": "positive"\n    }\n  ],\n  "actions": [\n    {\n      "label": "View Map",\n      "intent": "primary"\n    },\n    {\n      "label": "Share with Friends",\n      "intent": "secondary"\n    }\n  ]\n}',
      },
    ] as Message[],
    meta: {
      model,
      usage: {
        inputTokens: 277,
        outputTokens: 229,
        totalTokens: 506,
      },
      durationMs: 678,
      retries: 0,
      toolCalls: [],
      provider: { raw: null, errors: [] },
    },
  } as SignalResult<Card>,
  capturedAt: '2026-09-24T01:17:00+02:00',
  capturedWith: { provider: 'groq', model },
};

export const structuredRender = 'card' as const;

const initial: ChatViewInitial = {
  provider,
  model,
  systemPrompt,
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
      headline="Structured output IS your UI."
      body="Stop parsing free-form responses and rendering them as text. Define a schema that mirrors your component props and the model emits ready-to-render UI. Add a button type, a badge, an icon — the model figures out which ones fit. This is how you build product surfaces with LLMs."
    />
    <ChatView initial={initial} />
  </>
);
