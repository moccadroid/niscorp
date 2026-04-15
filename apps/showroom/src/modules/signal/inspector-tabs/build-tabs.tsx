import type { InspectorTabDef, Story } from '../../types';
import { isRecipeStory, isStreamStory } from '../story-types';
import { SetupTab } from './setup-tab';
import { StatsTab } from './stats-tab';
import { StreamSetupTab } from './stream-setup-tab';

// Chrome provides the Source tab for every story. Signal adds Setup
// (and Stats for recipe stories).
export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  if (isStreamStory(story)) {
    return [
      { id: 'setup', label: 'Setup', render: () => <StreamSetupTab story={story} /> },
    ];
  }
  if (!isRecipeStory(story)) return [];
  return [
    { id: 'setup', label: 'Setup', render: () => <SetupTab story={story} /> },
    { id: 'stats', label: 'Stats', render: () => <StatsTab /> },
  ];
};
