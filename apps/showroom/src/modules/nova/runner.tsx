import { type FC } from 'react';
import { isStory } from './story-types';

// A story is a story: just mount its Demo.
export const Runner: FC<{ story: unknown }> = ({ story }) => {
  if (!isStory(story)) return null;
  const { Demo } = story;
  return <Demo />;
};
