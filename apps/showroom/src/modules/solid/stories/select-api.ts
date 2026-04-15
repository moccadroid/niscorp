import type { StreamDemoStory } from '../story-types';
import * as recipe from './select-api.recipe';

export const selectApiStory: StreamDemoStory = {
  id: 'select-api',
  name: 'Independent selections',
  description: 'Four select() subscriptions — each renders independently, each finalizes at its own pace.',
  category: 'Live UI',
  kind: 'stream-demo',
  pitch: {
    headline: 'Subscribe to the parts you care about.',
    body: "Each select() returns a stream with its own on() and onFinal(). The widget panel stops updating the moment the parser moves past it. The response panel keeps streaming. The meta panel doesn't even start until everything else is done. No wasted renders — each panel only re-renders when its own data changes.",
  },
  recipe,
};
