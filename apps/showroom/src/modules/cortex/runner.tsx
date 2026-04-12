import type { FC } from 'react';
import {
  isCortexStory,
  isPrismMappingStory,
  isStructuredExtractStory,
  isToolUseStory,
  isPlanModeStory,
  isRulesStory,
} from './story-types';
import { PrismMappingRunner } from './runners/prism-mapping-runner';
import { StructuredExtractRunner } from './runners/structured-extract-runner';
import { ToolUseRunner } from './runners/tool-use-runner';
import { PlanModeRunner } from './runners/plan-mode-runner';
import { RulesRunner } from './runners/rules-runner';

// ═══════════════════════════════════════════════════════════
// Runner — discriminator. Dispatches to the runner for the
// active story's `demo` field.
// ═══════════════════════════════════════════════════════════

type Props = { story: unknown };

export const Runner: FC<Props> = ({ story }) => {
  if (!isCortexStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a cortex story.</div>;
  }
  if (isPrismMappingStory(story)) return <PrismMappingRunner story={story} />;
  if (isStructuredExtractStory(story)) return <StructuredExtractRunner story={story} />;
  if (isToolUseStory(story)) return <ToolUseRunner story={story} />;
  if (isPlanModeStory(story)) return <PlanModeRunner story={story} />;
  if (isRulesStory(story)) return <RulesRunner story={story} />;
  return <div style={{ padding: 24, color: '#9ca3af' }}>Unknown cortex story demo.</div>;
};
