import type { DotColor, StatusMap } from '../../types';
import { isNovaStory } from '../story-types';
import type { ExpectationResult } from '../../../lib/check-expectation';
import { evaluateLayoutStory } from './layout';
import { evaluateActionStory } from './action';
import { evaluateShellStory } from './shell';

const toDot = (result: ExpectationResult | undefined): DotColor => {
  if (result === undefined) return 'gray';
  return result.ok ? 'green' : 'red';
};

export const evaluateAll = async (stories: readonly unknown[]): Promise<StatusMap> => {
  const map: StatusMap = {};
  for (const story of stories) {
    if (!isNovaStory(story)) continue;
    try {
      if (story.kind === 'layout') {
        if (story.expected === undefined) {
          map[story.id] = 'gray';
        } else {
          map[story.id] = toDot(evaluateLayoutStory(story).result);
        }
      } else if (story.kind === 'action') {
        // eslint-disable-next-line no-await-in-loop
        map[story.id] = toDot(await evaluateActionStory(story));
      } else {
        // eslint-disable-next-line no-await-in-loop
        map[story.id] = toDot(await evaluateShellStory(story));
      }
    } catch {
      map[story.id] = 'red';
    }
  }
  return map;
};
