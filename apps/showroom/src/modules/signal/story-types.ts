import type { Story as BaseStory } from '@showroom/modules/types';

// Signal adds no extras beyond the chrome Story base. Each demo
// module exports whatever its inspector tabs need to read
// (provider, model, systemPrompt, schema, tools, snapshot,
// structuredRender, …) and those ride along on the story via
// the `...demo` spread in each .story.ts.

export type RecipeStory = BaseStory & { kind: 'recipe' };
export type StreamStory = BaseStory & { kind: 'stream' };
export type SignalStory = RecipeStory | StreamStory;
