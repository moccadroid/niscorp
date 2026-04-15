import type { StreamDemoStory } from '../story-types';
import * as recipe from './finalize-constraints.recipe';

export const finalizeConstraintsStory: StreamDemoStory = {
  id: 'finalize-constraints',
  name: 'Finalize-phase constraints',
  description: 'Opt in to constraint validation at field-finalize time — catches .min, .max, .regex, .refine without tripping on mid-stream partial strings.',
  category: 'Validation',
  kind: 'stream-demo',
  pitch: {
    headline: 'Schema constraints, enforced at the right moment.',
    body: 'Kind checks alone catch "array where string expected". But what about `email()` or `min(10)`? You cannot check those on a half-streamed string — the field is legitimately too short until the closing quote arrives. Setting constraints: "finalize" runs the sub-schema at the exact moment each field closes, so partial strings never trip constraints they will eventually satisfy.',
  },
  recipe,
  showModeSwitcher: true,
};
