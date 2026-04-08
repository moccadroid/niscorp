import { ConfigSchema, evaluateSafe } from '@niscorp/prism';
import type { ExpectationResult } from '../../../lib/check-expectation';
import { deepEqual } from '../../../lib/deep-equal';
import { isPrismStory } from '../story-types';

// ═══════════════════════════════════════════════════════════
// Synchronous evaluator for a single prism story.
// Returns undefined when the story has no `expected` (gray dot).
// Otherwise green if output equals expected, red with a reason
// if not (or if evaluation throws).
// ═══════════════════════════════════════════════════════════

export const evaluatePrismStory = (story: unknown): ExpectationResult | undefined => {
  if (!isPrismStory(story)) return undefined;

  const parsed = ConfigSchema.safeParse(story.config);
  if (!parsed.success) {
    return { ok: false, reasons: [`invalid config: ${parsed.error.message}`] };
  }

  const result = evaluateSafe(parsed.data, story.input);
  if (!result.ok) {
    return { ok: false, reasons: [`evaluation threw: ${result.error.message}`] };
  }

  if (story.expected === undefined) return undefined;

  if (deepEqual(result.data, story.expected)) return { ok: true };

  return {
    ok: false,
    reasons: [
      `output mismatch: expected ${JSON.stringify(story.expected)}, got ${JSON.stringify(result.data)}`,
    ],
  };
};
