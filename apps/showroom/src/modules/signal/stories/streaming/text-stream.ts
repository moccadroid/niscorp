import type { StreamStory } from '../../story-types';

export const textStreamStory: StreamStory = {
  id: 'text-stream',
  name: 'Text streaming',
  description: 'The simplest streaming demo — tokens arrive one by one from signal.stream() and render in real time.',
  category: 'Streaming',
  kind: 'stream',
  pitch: {
    headline: 'See every token the moment it arrives.',
    body: 'signal.stream() returns an AsyncIterable of events. Text deltas yield as they arrive from the provider SSE. No buffering, no polling — just a for-await loop. The same builder chain that powers .complete() works here: provider, model, system prompt, tools, schema.',
  },
  setup: {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    systemPrompt: 'You are a thorough technical writer. Give detailed, well-structured answers with examples. Use markdown formatting.',
    input: 'Write a comprehensive guide to ownership, borrowing, and lifetimes in Rust. Cover the borrow checker, mutable vs immutable references, lifetime annotations, and common pitfalls. Include code examples for each concept.',
  },
  code: `import { createSignal } from '@niscorp/signal';

const sig = createSignal('groq')
  .model('llama-3.3-70b-versatile')
  .systemPrompt('You are a thorough technical writer...');

for await (const ev of sig.stream('Write a comprehensive guide to ownership...')) {
  if (ev.type === 'text') process.stdout.write(ev.text);
  if (ev.type === 'done') console.log('\\n\\nTokens:', ev.meta.usage.totalTokens);
}`,
};
