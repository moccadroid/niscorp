import { z } from 'zod';
import { createSignal, type Message, type SignalResult } from '@niscorp/signal';
import { Pitch } from '@showroom/chrome/pitch';
import { ChatView, type ChatViewInitial } from '@showroom/modules/signal/chat/chat-view';

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
  client?: unknown,
): Promise<SignalResult<ReplyWithActions>> =>
  createSignal(provider, { client })
    .apiKey(apiKey)
    .model(model)
    .systemPrompt(systemPrompt)
    .schema(schema)
    .history(history)
    .complete(input);

const snapshotResponse: ReplyWithActions = {
  reply:
    'Welcome aboard! The fastest way to feel the product is to spin up your first project — it takes about 30 seconds and unlocks everything else. From there, most people invite a teammate or hook up an integration so the data starts flowing in.',
  suggestions: [
    { label: 'Create my first project', prompt: 'Walk me through creating my first project.' },
    { label: 'Invite a teammate', prompt: 'How do I invite a teammate to my workspace?' },
    { label: 'Connect an integration', prompt: 'Which integrations are available and how do I connect one?' },
    { label: 'Show me a quick tour', prompt: 'Give me a 60-second tour of the main features.' },
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
      usage: { inputTokens: 72, outputTokens: 134, totalTokens: 206 },
      durationMs: 668,
      retries: 0,
      toolCalls: [],
      provider: { raw: null, errors: [] },
    },
  } as SignalResult<ReplyWithActions>,
  capturedAt: '2026-04-08T10:00:00Z',
  capturedWith: { provider: 'groq', model },
};

export const structuredRender = 'json' as const;

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
      headline="Build guided chat experiences with one schema."
      body="Most production assistants need more than free-form text — they need typed metadata to drive UI: suggested replies, citations, attached entities. With signal, you describe that shape once in Zod and the model fills it in. The same builder, the same call, the same typed result."
    />
    <ChatView initial={initial} />
  </>
);
