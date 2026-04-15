import type { Story } from '../types';
import { RecipeRunner } from './runners/recipe-runner';
import { StreamRunner } from './runners/stream-runner';
import { getStorySource } from './stories/source-map';
import { isStreamStory, type RecipeStory, type StreamStory } from './story-types';

import { plainCompletionStory } from './stories/basics/plain-completion';
import { systemPromptStory } from './stories/basics/system-prompt';
import { multiTurnStory } from './stories/basics/multi-turn';
import { singleToolStory } from './stories/tools/single-tool';
import { structuredOutputStory } from './stories/shaping/structured-output';
import { uiCardStory } from './stories/shaping/ui-card';
import { actionSuggestionsStory } from './stories/shaping/action-suggestions';
import { textStreamStory } from './stories/streaming/text-stream';
import { structuredStreamStory } from './stories/streaming/structured-stream';
import { dashboardStreamStory } from './stories/streaming/dashboard-stream';

const raw: readonly (RecipeStory | StreamStory)[] = [
  plainCompletionStory,
  systemPromptStory,
  multiTurnStory,
  singleToolStory,
  structuredOutputStory,
  uiCardStory,
  actionSuggestionsStory,
  textStreamStory,
  structuredStreamStory,
  dashboardStreamStory,
];

// Wrap each Signal-specific story into a chrome Story. The authored
// Story extras (recipe, pitch, expected, snapshot, …) ride along on
// the same object — inspector tabs cast back to their typed shape.
export const stories: readonly Story[] = raw.map((s): Story => {
  const Demo = isStreamStory(s)
    ? () => <StreamRunner story={s} />
    : () => <RecipeRunner story={s} />;
  return {
    ...s,
    Demo,
    source: getStorySource(s.id),
  };
});
