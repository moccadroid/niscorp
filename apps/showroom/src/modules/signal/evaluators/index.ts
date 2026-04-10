import type { DotColor, StatusMap } from '../../types';
import type { ExpectationResult } from '../../../lib/check-expectation';
import { isRecipeStory, type RecipeStory } from '../story-types';

// ═══════════════════════════════════════════════════════════
// Recipe evaluator — runs assertions against the story's
// snapshot. Recipes without a snapshot or without an expected
// field stay gray (no opinion).
// ═══════════════════════════════════════════════════════════

const evaluateRecipe = (story: RecipeStory): ExpectationResult | undefined => {
  if (story.snapshot === undefined || story.expected === undefined) return undefined;
  const result = story.snapshot.result;
  const reasons: string[] = [];

  const content =
    typeof result.response === 'string' ? result.response : JSON.stringify(result.response);

  if (story.expected.contentIncludes !== undefined) {
    for (const sub of story.expected.contentIncludes) {
      if (!content.includes(sub)) reasons.push(`contentIncludes: missing "${sub}"`);
    }
  }
  if (story.expected.minToolCalls !== undefined) {
    if (result.meta.toolCalls.length < story.expected.minToolCalls) {
      reasons.push(
        `minToolCalls: expected ${story.expected.minToolCalls}, got ${result.meta.toolCalls.length}`,
      );
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true };
};

const toDot = (result: ExpectationResult | undefined): DotColor => {
  if (result === undefined) return 'gray';
  return result.ok ? 'green' : 'red';
};

export const evaluateAll = async (stories: readonly unknown[]): Promise<StatusMap> => {
  const map: StatusMap = {};
  for (const story of stories) {
    if (!isRecipeStory(story)) continue;
    map[story.id] = toDot(evaluateRecipe(story));
  }
  return map;
};
