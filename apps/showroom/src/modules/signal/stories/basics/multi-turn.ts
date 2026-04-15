import type { RecipeStory } from '../../story-types';
import * as recipe from './multi-turn.recipe';

export const multiTurnStory: RecipeStory = {
  id: 'multi-turn',
  name: 'Multi-turn conversation',
  description:
    'Pre-seed the conversation with .history() to give the model context from prior turns. The next user input continues the same conversation.',
  category: 'Basics',
  kind: 'recipe',
  pitch: {
    headline: 'Stateful chats without the boilerplate.',
    body: 'Pass an array of past messages to .history() and the next .complete() picks up the thread. Signal returns the full updated history on every result, so persisting and rehydrating a conversation is just push the new messages and call again.',
  },
  recipe,
  snapshot: {
    result: {
      response:
        'Sure! Here is a simple function that adds two numbers:\n\n```js\nfunction add(a, b) {\n  return a + b;\n}\n\nconsole.log(add(2, 3)); // 5\n```\n\nThe function `add` takes two parameters and returns their sum.',
      history: [
        { role: 'system', content: 'You are a friendly tutor for new programmers.' },
        { role: 'user', content: 'What is a function in programming?' },
        {
          role: 'assistant',
          content:
            'A function is a reusable block of code that performs a specific task. You give it inputs (parameters), it does some work, and optionally returns a value.',
        },
        { role: 'user', content: 'Can you give me a tiny example in JavaScript?' },
        {
          role: 'assistant',
          content:
            'Sure! Here is a simple function that adds two numbers:\n\n```js\nfunction add(a, b) {\n  return a + b;\n}\n\nconsole.log(add(2, 3)); // 5\n```\n\nThe function `add` takes two parameters and returns their sum.',
        },
      ],
      meta: {
        model: 'openai/gpt-oss-120b',
        usage: { inputTokens: 73, outputTokens: 65, totalTokens: 138 },
        durationMs: 891,
        retries: 0,
        toolCalls: [],
        provider: { raw: null, errors: [] },
      },
    },
    capturedAt: '2026-04-08T10:00:00Z',
    capturedWith: { provider: 'groq', model: 'openai/gpt-oss-120b' },
    notes: 'Illustrative snapshot — code examples vary.',
  },
  expected: { contentIncludes: ['function', 'add'] },
};
