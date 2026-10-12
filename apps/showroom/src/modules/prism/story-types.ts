import type { JsonObject } from '@niscorp/prism';
import type { Story as BaseStory } from '@showroom/modules/types';

export type PrismStory = BaseStory & {
  kind: 'transform';
  input: JsonObject;
  config: unknown;
};
