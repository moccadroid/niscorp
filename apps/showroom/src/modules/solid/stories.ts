import { aiResponseStory } from './stories/ai-response';
import { searchResultsStory } from './stories/search-results';
import { dashboardStory } from './stories/dashboard';
import { selectApiStory } from './stories/select-api';
import { subtreeFinalizationStory } from './stories/subtree-finalization';
import { destroyMidstreamStory } from './stories/destroy-midstream';
import { performanceStory } from './stories/performance';
import type { StreamDemoStory } from './story-types';

export const stories: readonly StreamDemoStory[] = [
  aiResponseStory,
  searchResultsStory,
  dashboardStory,
  selectApiStory,
  subtreeFinalizationStory,
  destroyMidstreamStory,
  performanceStory,
];
