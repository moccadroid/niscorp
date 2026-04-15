import type { RecipeStory } from '../../story-types';
import * as recipe from './ui-card.recipe';

export const uiCardStory: RecipeStory = {
  id: 'ui-card',
  name: 'Generated UI card',
  description:
    "The model returns a structured Card object — title, body, badges, action buttons — and signal renders it as an actual UI card in the chat. Structured output isn't just data: it's a UI generator.",
  category: 'Shaping',
  kind: 'recipe',
  pitch: {
    headline: 'Structured output IS your UI.',
    body: 'Stop parsing free-form responses and rendering them as text. Define a schema that mirrors your component props and the model emits ready-to-render UI. Add a button type, a badge, an icon — the model figures out which ones fit. This is how you build product surfaces with LLMs.',
  },
  structuredRender: 'card',
  recipe,
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
    notes: 'Illustrative snapshot. The model picks different trails and badges every run.',
  },
  expected: { contentIncludes: [] },
};
