import type { ZodType } from 'zod';
import type { Story as BaseStory } from '@showroom/modules/types';

export type LoomStory = BaseStory & {
  kind: 'basics' | 'structure' | 'resolver' | 'plugins';
  schema?: ZodType;
};

export const isLoomStory = (value: unknown): value is LoomStory => {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['id'] === 'string' && typeof v['Demo'] === 'function';
};
