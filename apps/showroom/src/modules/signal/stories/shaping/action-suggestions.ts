import type { RecipeStory } from '../../story-types';
import * as recipe from './action-suggestions.recipe';

export const actionSuggestionsStory: RecipeStory = {
  id: 'action-suggestions',
  name: 'Reply + suggested actions',
  description:
    'A conversational reply plus a typed list of follow-up suggestions. Hook the suggestions up to your compose box and you have a guided chat in 20 lines.',
  category: 'Shaping',
  kind: 'recipe',
  pitch: {
    headline: 'Build guided chat experiences with one schema.',
    body: 'Most production assistants need more than free-form text — they need typed metadata to drive UI: suggested replies, citations, attached entities. With signal, you describe that shape once in Zod and the model fills it in. The same builder, the same call, the same typed result.',
  },
  structuredRender: 'json',
  recipe,
  snapshot: {
    result: {
      response: {
        reply:
          'Welcome aboard! The fastest way to feel the product is to spin up your first project — it takes about 30 seconds and unlocks everything else. From there, most people invite a teammate or hook up an integration so the data starts flowing in.',
        suggestions: [
          { label: 'Create my first project', prompt: 'Walk me through creating my first project.' },
          { label: 'Invite a teammate', prompt: 'How do I invite a teammate to my workspace?' },
          { label: 'Connect an integration', prompt: 'Which integrations are available and how do I connect one?' },
          { label: 'Show me a quick tour', prompt: 'Give me a 60-second tour of the main features.' },
        ],
      },
      history: [
        {
          role: 'system',
          content:
            'You are a helpful product assistant. Always include 2-4 follow-up suggestions that move the conversation forward.',
        },
        { role: 'user', content: 'I just signed up. What should I try first?' },
        {
          role: 'assistant',
          content: '{"reply":"Welcome aboard! ...","suggestions":[ ... ]}',
        },
      ],
      meta: {
        model: 'openai/gpt-oss-120b',
        usage: { inputTokens: 72, outputTokens: 134, totalTokens: 206 },
        durationMs: 668,
        retries: 0,
        toolCalls: [],
        provider: { raw: null, errors: [] },
      },
    },
    capturedAt: '2026-04-08T10:00:00Z',
    capturedWith: { provider: 'groq', model: 'openai/gpt-oss-120b' },
    notes: 'Illustrative snapshot. Live suggestions vary.',
  },
  expected: { contentIncludes: [] },
};
