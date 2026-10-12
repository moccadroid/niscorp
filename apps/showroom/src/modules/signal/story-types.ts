import type { Story as BaseStory } from '@showroom/modules/types';

export type RecipeStory = BaseStory & { kind: 'recipe' };
export type StreamStory = BaseStory & { kind: 'stream' };
export type SignalStory = RecipeStory | StreamStory;
