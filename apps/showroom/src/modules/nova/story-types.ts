import type { FC } from 'react';

export type StoryKind = 'layout' | 'action' | 'shell';

export type Story = {
  id: string;
  name: string;
  description: string;
  category: string;
  kind: StoryKind;
  Demo: FC;
  source: string;
};

export const isStory = (value: unknown): value is Story => {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v['id'] !== 'string') return false;
  if (typeof v['name'] !== 'string') return false;
  if (typeof v['Demo'] !== 'function') return false;
  return v['kind'] === 'layout' || v['kind'] === 'action' || v['kind'] === 'shell';
};
