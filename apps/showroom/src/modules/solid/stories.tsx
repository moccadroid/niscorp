import type { Story } from '../types';
import { Runner } from './runner';
import { getStorySource } from './stories/source-map';
import { aiResponseStory } from './stories/ai-response';
import { searchResultsStory } from './stories/search-results';
import { dashboardStory } from './stories/dashboard';
import { selectApiStory } from './stories/select-api';
import { subtreeFinalizationStory } from './stories/subtree-finalization';
import { destroyMidstreamStory } from './stories/destroy-midstream';
import { performanceStory } from './stories/performance';
import { hallucinatedFieldsStory } from './stories/hallucinated-fields';
import { strictHaltStory } from './stories/strict-halt';
import { finalizeConstraintsStory } from './stories/finalize-constraints';
import { scopedErrorsStory } from './stories/scoped-errors';
import type { StreamDemoStory } from './story-types';

const raw: readonly StreamDemoStory[] = [
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

export const stories: readonly Story[] = raw.map((s): Story => ({
  ...s,
  Demo: () => <Runner story={s} />,
  source: getStorySource(s.id),
}));
