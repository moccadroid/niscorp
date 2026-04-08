import type { DotColor, StatusMap } from '../../types';
import type { ExpectationResult } from '../../../lib/check-expectation';
import { isPrismStory } from '../story-types';
import { evaluatePrismStory } from './prism';

const toDot = (result: ExpectationResult | undefined): DotColor => {
  if (result === undefined) return 'gray';
  return result.ok ? 'green' : 'red';
};

export const evaluateAll = async (stories: readonly unknown[]): Promise<StatusMap> => {
  const map: StatusMap = {};
  for (const story of stories) {
    if (!isPrismStory(story)) continue;
    map[story.id] = toDot(evaluatePrismStory(story));
  }
  return map;
};
