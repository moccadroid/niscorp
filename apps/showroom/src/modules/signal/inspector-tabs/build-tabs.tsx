import type { InspectorTabDef } from '../../types';
import { isRecipeStory, isStreamStory } from '../story-types';
import { SetupTab } from './setup-tab';
import { SourceTab } from './source-tab';
import { StatsTab } from './stats-tab';
import { StreamSetupTab } from './stream-setup-tab';

export const buildInspectorTabs = (story: unknown): InspectorTabDef[] => {
  if (isStreamStory(story)) {
    return [
      { id: 'setup', label: 'Setup', render: () => <StreamSetupTab story={story} /> },
      { id: 'source', label: 'Source', render: () => <SourceTab story={story} /> },
    ];
  }
  if (!isRecipeStory(story)) return [];
  return [
    { id: 'setup', label: 'Setup', render: () => <SetupTab story={story} /> },
    { id: 'source', label: 'Source', render: () => <SourceTab story={story} /> },
    { id: 'stats', label: 'Stats', render: () => <StatsTab /> },
  ];
};
