import type { InspectorTabDef } from '../../types';
import { isRecipeStory, isStreamStory } from '../story-types';
import { SetupTab } from './setup-tab';
import { CodeTab } from './code-tab';
import { StatsTab } from './stats-tab';
import { StreamCodeTab } from './stream-code-tab';
import { StreamSetupTab } from './stream-setup-tab';

export const buildInspectorTabs = (story: unknown): InspectorTabDef[] => {
  if (isStreamStory(story)) {
    return [
      { id: 'setup', label: 'Setup', render: () => <StreamSetupTab story={story} /> },
      { id: 'code', label: 'Code', render: () => <StreamCodeTab story={story} /> },
    ];
  }
  if (!isRecipeStory(story)) return [];
  return [
    { id: 'setup', label: 'Setup', render: () => <SetupTab story={story} /> },
    { id: 'code', label: 'Code', render: () => <CodeTab story={story} /> },
    { id: 'stats', label: 'Stats', render: () => <StatsTab /> },
  ];
};
