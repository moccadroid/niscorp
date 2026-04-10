import { z } from 'zod';
import type { RecipeStory } from '../../story-types';

// The killer demo: model output drives UI directly. The schema describes
// a card component, the runtime renders it as an actual card in the chat.
const CardSchema = z.object({
  title: z.string().describe('Headline of the card.'),
  subtitle: z.string().describe('Short supporting line.'),
  body: z.string().describe('Two or three sentences of detail.'),
  badges: z
    .array(
      z.object({
        label: z.string(),
        tone: z.enum(['neutral', 'positive', 'warning', 'danger']),
      }),
    )
    .describe('Pill-shaped tags shown above the title.'),
  actions: z
    .array(
      z.object({
        label: z.string().describe('Button text.'),
        intent: z.enum(['primary', 'secondary']).describe('Button style.'),
      }),
    )
    .describe('Call-to-action buttons under the body.'),
});

export const uiCardStory: RecipeStory = {
  id: 'ui-card',
  name: 'Generated UI card',
  description:
    'The model returns a structured Card object — title, body, badges, action buttons — and signal renders it as an actual UI card in the chat. Structured output isn\'t just data: it\'s a UI generator.',
  category: 'Shaping',
  kind: 'recipe',
  pitch: {
    headline: 'Structured output IS your UI.',
    body: "Stop parsing free-form responses and rendering them as text. Define a schema that mirrors your component props and the model emits ready-to-render UI. Add a button type, a badge, an icon — the model figures out which ones fit. This is how you build product surfaces with LLMs.",
  },
  structuredRender: 'card',
  setup: {
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    schema: CardSchema,
    systemPrompt:
      'You generate UI cards. Pick badges and actions that genuinely fit the topic. Keep the body to 2-3 sentences.',
    input: 'Show me a card recommending a weekend hiking trail near San Francisco.',
  },
  code: `import { z } from 'zod';
import { createSignal } from '@niscorp/signal';

// Mirror your real React component props in the schema.
const CardSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  body: z.string(),
  badges: z.array(z.object({
    label: z.string(),
    tone: z.enum(['neutral', 'positive', 'warning', 'danger']),
  })),
  actions: z.array(z.object({
    label: z.string(),
    intent: z.enum(['primary', 'secondary']),
  })),
});

const result = await createSignal('groq')
  .apiKey(process.env.GROQ_API_KEY!)
  .model('openai/gpt-oss-120b')
  .systemPrompt('You generate UI cards. Pick badges and actions that fit.')
  .schema(CardSchema)
  .complete('Show me a card recommending a weekend hiking trail.');

// Render directly — the shape matches your component.
return <Card {...result.response} />;
`,
  snapshot: {
    result: {
      response: {
        title: 'Mount Tamalpais Loop',
        subtitle: 'Marin County · 7.2 mi · moderate',
        body: 'A classic Bay Area ridge hike with sweeping ocean views, redwood groves, and a brutal final climb that earns the panorama at the summit. Best in the early morning before the marine layer burns off.',
        badges: [
          { label: 'Moderate', tone: 'warning' },
          { label: 'Dog friendly', tone: 'positive' },
          { label: '~3 hrs drive', tone: 'neutral' },
        ],
        actions: [
          { label: 'Open in Maps', intent: 'primary' },
          { label: 'Save for later', intent: 'secondary' },
        ],
      },
      history: [
        {
          role: 'system',
          content:
            'You generate UI cards. Pick badges and actions that genuinely fit the topic. Keep the body to 2-3 sentences.',
        },
        {
          role: 'user',
          content: 'Show me a card recommending a weekend hiking trail near San Francisco.',
        },
        {
          role: 'assistant',
          content: '{"title":"Mount Tamalpais Loop", ... }',
        },
      ],
      meta: {
        model: 'openai/gpt-oss-120b',
        usage: { inputTokens: 88, outputTokens: 142, totalTokens: 230 },
        durationMs: 712,
        retries: 0,
        toolCalls: [],
        provider: { raw: null, errors: [] },
      },
    },
    capturedAt: '2026-04-08T10:00:00Z',
    capturedWith: { provider: 'groq', model: 'openai/gpt-oss-120b' },
    notes:
      'Illustrative snapshot. The model picks different trails and badges every run.',
  },
  expected: {
    contentIncludes: [],
  },
};
