import type { StreamDemoStory } from '../story-types';
import * as recipe from './subtree-finalization.recipe';

export const subtreeFinalizationStory: StreamDemoStory = {
  id: 'subtree-finalization',
  name: 'Subtree finalization',
  description: 'Subtrees finalize as the parser moves past them — no waiting for the full stream.',
  category: 'Finalization',
  kind: 'stream-demo',
  pitch: {
    headline: 'React to parts, not the whole.',
    body: 'JSON keys are written left-to-right. When the parser sees "response" start, it knows "widget" is done. select("widget").onFinal() fires immediately. You can render the widget, dispatch an action, or start a follow-up request — all while the response is still streaming.',
  },
  recipe,
  expected: {
    finalizationOrder: ['widget', 'response', 'reasoning', 'meta'],
  },
};
