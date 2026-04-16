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
export const model = 'openai/gpt-oss-120b';
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
  title: 'Mount Tamalpais Loop',
  subtitle: 'Marin County · 7.2 mi · moderate',
  body:
    'A classic Bay Area ridge hike with sweeping ocean views, redwood groves, and a brutal final climb that earns the panorama at the summit. Best in the early morning before the marine layer burns off.',
  badges: [
    { label: 'Moderate', tone: 'warning' },
    { label: 'Dog friendly', tone: 'positive' },
    { label: '~3 hrs drive', tone: 'neutral' },
  ],
  actions: [
    { label: 'Open in Maps', intent: 'primary' },
    { label: 'Save for later', intent: 'secondary' },
  ],
};

export const snapshot = {
  result: {
    response: snapshotResponse,
    history: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput },
      { role: 'assistant', content: JSON.stringify(snapshotResponse) },
    ] as Message[],
    meta: {
      model,
      usage: { inputTokens: 88, outputTokens: 142, totalTokens: 230 },
      durationMs: 712,
      retries: 0,
      toolCalls: [],
      provider: { raw: null, errors: [] },
    },
  } as SignalResult<Card>,
  capturedAt: '2026-04-08T10:00:00Z',
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
