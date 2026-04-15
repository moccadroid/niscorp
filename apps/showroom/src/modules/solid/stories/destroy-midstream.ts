import type { StreamDemoStory } from '../story-types';
import * as recipe from './destroy-midstream.recipe';

export const destroyMidstreamStory: StreamDemoStory = {
  id: 'destroy-midstream',
  name: 'Destroy mid-stream',
  description: 'Cancel a stream mid-flight — state freezes, listeners detach, promises reject.',
  category: 'Lifecycle',
  kind: 'stream-demo',
  pitch: {
    headline: 'Clean cancellation, zero leaks.',
    body: 'Call destroy() at any point and everything stops. Listeners are removed, pending final() promises reject, selected streams detach. The last valid state is preserved. Essential for component unmounting, user cancellation, or timeout handling.',
  },
  recipe,
};
