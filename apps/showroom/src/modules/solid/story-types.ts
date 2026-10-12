import type { Story as BaseStory } from '@showroom/modules/types';

export type StreamDemoStory = BaseStory & {
  kind: 'stream-demo';
};
