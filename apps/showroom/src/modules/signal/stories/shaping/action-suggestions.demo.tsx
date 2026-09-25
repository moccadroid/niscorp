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
export const model = 'qwen/qwen3.8-27b';
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
  reply: 'Welcome aboard! Here\'s a quick starter plan for your first few minutes.\n\n1. **Complete your profile** – Add a display name, bio, and an avatar. A profile feels 10x more personal and lets anyone who finds you understand who you are at a glance.\n\n2. **Follow or join 3–5 topics, groups, or creators** that genuinely interest you. Start narrow (e.g., "UI design + side projects" rather than just "design") so the feed stays sharp.\n\n3. **Do one small public action today** – Post a quick intro, share a link, or react to someone\'s post. The first interaction is the hardest; once it\'s done, everything else gets easier.\n\n4. **Turn on notifications** for the people and topics you actually care about, and mute the rest so the feed stays a useful signal.\n\nA good rule: aim for one real interaction per day for about a week. Streaks build momentum better than bursts do.\n\nTell me what interests you and I can point you to specific people or threads to start with.',
  suggestions: [
    {
      label: 'Show me popular posts this week',
      prompt: 'Show me the most popular posts from the last 7 days across all topics and communities.',
    },
    {
      label: 'Suggest topics to follow',
      prompt: 'Suggest 5 topics or communities for me to follow based on my interests.',
    },
    {
      label: 'Help me write an intro post',
      prompt: 'Help me write a short intro post to share with the community that highlights who I am and what I\'m into.',
    },
    {
      label: 'Show me a daily starter routine',
      prompt: 'Give me a concrete 30-minute daily routine to stay engaged and get the most out of the platform.',
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
        content: 'You are a helpful product assistant. Always include 2-4 follow-up suggestions that move the conversation forward.',
      },
      {
        role: 'user',
        content: 'I just signed up. What should I try first?',
      },
      {
        role: 'system',
        content: 'OUTPUT SCHEMA: your final reply must be ONLY a JSON value matching this schema — raw JSON, no prose, no code fences:\n{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"reply":{"type":"string","description":"Conversational answer to the user."},"suggestions":{"maxItems":4,"type":"array","items":{"type":"object","properties":{"label":{"type":"string","maxLength":40,"description":"Short button label, max 40 chars."},"prompt":{"type":"string","description":"The full follow-up message to send when clicked."}},"required":["label","prompt"],"additionalProperties":false},"description":"Up to four suggested follow-up actions."}},"required":["reply","suggestions"],"additionalProperties":false}',
      },
      {
        role: 'assistant',
        content: '{"reply":"Welcome aboard! Here\'s a quick starter plan for your first few minutes.\\n\\n1. **Complete your profile** – Add a display name, bio, and an avatar. A profile feels 10x more personal and lets anyone who finds you understand who you are at a glance.\\n\\n2. **Follow or join 3–5 topics, groups, or creators** that genuinely interest you. Start narrow (e.g., \\"UI design + side projects\\" rather than just \\"design\\") so the feed stays sharp.\\n\\n3. **Do one small public action today** – Post a quick intro, share a link, or react to someone\'s post. The first interaction is the hardest; once it\'s done, everything else gets easier.\\n\\n4. **Turn on notifications** for the people and topics you actually care about, and mute the rest so the feed stays a useful signal.\\n\\nA good rule: aim for one real interaction per day for about a week. Streaks build momentum better than bursts do.\\n\\nTell me what interests you and I can point you to specific people or threads to start with.", "suggestions":[{"label":"Show me popular posts this week","prompt":"Show me the most popular posts from the last 7 days across all topics and communities."},{"label":"Suggest topics to follow","prompt":"Suggest 5 topics or communities for me to follow based on my interests."},{"label":"Help me write an intro post","prompt":"Help me write a short intro post to share with the community that highlights who I am and what I\'m into."},{"label":"Show me a daily starter routine","prompt":"Give me a concrete 30-minute daily routine to stay engaged and get the most out of the platform."}]}',
      },
    ] as Message[],
    meta: {
      model,
      usage: {
        inputTokens: 218,
        outputTokens: 369,
        totalTokens: 587,
      },
      durationMs: 962,
      retries: 0,
      toolCalls: [],
      provider: { raw: null, errors: [] },
    },
  } as SignalResult<ReplyWithActions>,
  capturedAt: '2026-09-24T01:17:00+02:00',
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
