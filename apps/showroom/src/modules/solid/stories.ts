import type { StreamDemoStory } from './story-types';

import { story as aiResponseStory } from './stories/ai-response.story';
import { story as searchResultsStory } from './stories/search-results.story';
import { story as dashboardStory } from './stories/dashboard.story';
import { story as selectApiStory } from './stories/select-api.story';
import { story as subtreeFinalizationStory } from './stories/subtree-finalization.story';
import { story as destroyMidstreamStory } from './stories/destroy-midstream.story';
import { story as performanceStory } from './stories/performance.story';
import { story as hallucinatedFieldsStory } from './stories/hallucinated-fields.story';
import { story as strictHaltStory } from './stories/strict-halt.story';
import { story as finalizeConstraintsStory } from './stories/finalize-constraints.story';
import { story as scopedErrorsStory } from './stories/scoped-errors.story';

export const stories: readonly StreamDemoStory[] = [
  aiResponseStory,
  searchResultsStory,
  dashboardStory,
  selectApiStory,
  subtreeFinalizationStory,
  destroyMidstreamStory,
  performanceStory,
  hallucinatedFieldsStory,
  strictHaltStory,
  finalizeConstraintsStory,
  scopedErrorsStory,
];
