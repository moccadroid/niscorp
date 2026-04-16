import type { JsonObject } from '@niscorp/prism';
import type { Story as BaseStory } from '@showroom/modules/types';

// ═══════════════════════════════════════════════════════════
// Prism extends the chrome Story with the authored input +
// config. That's all the inspector tabs need — Stats and
// Compiled both read these fields directly.
// ═══════════════════════════════════════════════════════════

export type PrismStory = BaseStory & {
  kind: 'transform';
  input: JsonObject;
  config: unknown;
};
