import type { StreamDemoStory } from '../story-types';
import * as recipe from './strict-halt.recipe';

export const strictHaltStory: StreamDemoStory = {
  id: 'strict-halt',
  name: 'Strict halt',
  description: 'Strict mode enters a terminal failed state on the first violation. No further updates are applied.',
  category: 'Validation',
  kind: 'stream-demo',
  pitch: {
    headline: 'When wrong is worse than slow.',
    body: 'Strict mode trades resilience for certainty. The moment the LLM emits a shape violation, the stream freezes at the last valid snapshot and final() rejects. Useful when you cannot afford to render partial-bad data — e.g. the output drives side effects you cannot roll back.',
  },
  recipe,
  showModeSwitcher: true,
};
