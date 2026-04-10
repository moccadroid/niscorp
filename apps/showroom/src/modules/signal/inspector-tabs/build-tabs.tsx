import type { InspectorTabDef } from '../../types';
import { isRecipeStory } from '../story-types';
import { SetupTab } from './setup-tab';
import { CodeTab } from './code-tab';
import { StatsTab } from './stats-tab';

export const buildInspectorTabs = (story: unknown): InspectorTabDef[] => {
  if (!isRecipeStory(story)) return [];
  return [
    { id: 'setup', label: 'Setup', render: () => <SetupTab story={story} /> },
    { id: 'code', label: 'Code', render: () => <CodeTab story={story} /> },
    { id: 'stats', label: 'Stats', render: () => <StatsTab /> },
  ];
};
