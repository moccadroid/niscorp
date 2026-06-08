import type { SignalStory } from './story-types';

import { story as plainCompletionStory } from './stories/basics/plain-completion.story';
import { story as systemPromptStory } from './stories/basics/system-prompt.story';
import { story as multiTurnStory } from './stories/basics/multi-turn.story';
import { story as singleToolStory } from './stories/tools/single-tool.story';
import { story as structuredOutputStory } from './stories/shaping/structured-output.story';
import { story as uiCardStory } from './stories/shaping/ui-card.story';
import { story as actionSuggestionsStory } from './stories/shaping/action-suggestions.story';
import { story as textStreamStory } from './stories/streaming/text-stream.story';
import { story as structuredStreamStory } from './stories/streaming/structured-stream.story';
import { story as dashboardStreamStory } from './stories/streaming/dashboard-stream.story';
import { story as embeddingSimilarityStory } from './stories/embedding/similarity.story';

export const stories: readonly SignalStory[] = [
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
  embeddingSimilarityStory,
];
