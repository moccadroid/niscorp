import type { StreamStory } from '../../story-types';
import * as recipe from './text-stream.recipe';

export const textStreamStory: StreamStory = {
  id: 'text-stream',
  name: 'Text streaming',
  description:
    'The simplest streaming demo — tokens arrive one by one from signal.stream() and render in real time.',
  category: 'Streaming',
  kind: 'stream',
  pitch: {
    headline: 'See every token the moment it arrives.',
    body: 'signal.stream() returns an AsyncIterable of events. Text deltas yield as they arrive from the provider SSE. No buffering, no polling — just a for-await loop. The same builder chain that powers .complete() works here: provider, model, system prompt, tools, schema.',
  },
  recipe,
};
