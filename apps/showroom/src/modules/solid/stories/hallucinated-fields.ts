import type { StreamDemoStory } from '../story-types';
import * as recipe from './hallucinated-fields.recipe';

export const hallucinatedFieldsStory: StreamDemoStory = {
  id: 'hallucinated-fields',
  name: 'Hallucinated fields',
  description: 'The LLM sends wrong types for several fields. Flip between trust / recover / strict to see how solid handles it.',
  category: 'Validation',
  kind: 'stream-demo',
  pitch: {
    headline: "current() is always shape-valid — no matter what the LLM sends.",
    body: "This payload intentionally hallucinates: count is a string, items is an object, meta is null where a nested object is expected. In recover mode solid skips each bad value and preserves the prior one, so your UI never sees count + 1 crash or items.map fail. Strict mode halts the whole stream on first violation. Trust mode lets the mess through — included only so you can see why the invariant matters.",
  },
  recipe,
  showModeSwitcher: true,
};
