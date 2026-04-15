import type { Story as BaseStory } from '../types';

// Solid adds no extras beyond the chrome Story base. The demo's
// module exports (schema, initial, json) ride along on the story
// via the `...demo` spread, so inspector tabs can read them as
// direct story fields — no recipe wrapper type needed.

export type StreamDemoStory = BaseStory & {
  kind: 'stream-demo';
};
