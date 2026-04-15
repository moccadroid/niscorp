import type { RecipeStory } from '../../story-types';
import * as recipe from './structured-output.recipe';

export const structuredOutputStory: RecipeStory = {
  id: 'structured-output',
  name: 'Structured output',
  description:
    'Use .schema(zodSchema) to constrain the response to a typed object. Signal handles native JSON-schema mode where supported and falls back to a tool-calling-based strategy otherwise. The result.response is fully typed and validated.',
  category: 'Shaping',
  kind: 'recipe',
  pitch: {
    headline: "Define a Zod schema. Get a typed object back. That's it.",
    body: "No prompt engineering, no JSON.parse(), no validation glue. Hand signal a Zod schema and result.response is a fully-typed parsed object — even on providers that don't natively support JSON-schema mode (signal falls back to a tool-calling strategy automatically).",
  },
  structuredRender: 'json',
  recipe,
  snapshot: {
    result: {
      response: {
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
      },
      history: [
        {
          role: 'user',
          content: 'Give me a recipe for classic spaghetti carbonara for 2 people.',
        },
        {
          role: 'assistant',
          content:
            '{"title":"Spaghetti Carbonara","servings":2,"ingredients":[...],"steps":[...],"tags":[...]}',
        },
      ],
      meta: {
        model: 'openai/gpt-oss-120b',
        usage: { inputTokens: 96, outputTokens: 178, totalTokens: 274 },
        durationMs: 924,
        retries: 0,
        toolCalls: [],
        provider: { raw: null, errors: [] },
      },
    },
    capturedAt: '2026-04-08T10:00:00Z',
    capturedWith: { provider: 'groq', model: 'openai/gpt-oss-120b' },
    notes:
      'Illustrative snapshot. Live runs return the same shape but the wording will vary.',
  },
  expected: { contentIncludes: ['Carbonara'] },
};
