import type { RecipeStory } from './story-types';

import { plainCompletionStory } from './stories/basics/plain-completion';
import { systemPromptStory } from './stories/basics/system-prompt';
import { multiTurnStory } from './stories/basics/multi-turn';
import { singleToolStory } from './stories/tools/single-tool';
import { structuredOutputStory } from './stories/shaping/structured-output';
import { uiCardStory } from './stories/shaping/ui-card';
import { actionSuggestionsStory } from './stories/shaping/action-suggestions';

export const stories: readonly RecipeStory[] = [
  plainCompletionStory,
  systemPromptStory,
  multiTurnStory,
  singleToolStory,
  structuredOutputStory,
  uiCardStory,
  actionSuggestionsStory,
];
