import type { FC } from 'react';
import { isStreamStory } from './story-types';
import { RecipeRunner } from './runners/recipe-runner';
import { StreamRunner } from './runners/stream-runner';

type Props = { story: unknown };

export const Runner: FC<Props> = ({ story }) => {
  if (isStreamStory(story)) return <StreamRunner story={story} />;
  return <RecipeRunner story={story} />;
};
