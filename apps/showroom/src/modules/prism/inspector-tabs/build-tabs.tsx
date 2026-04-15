import type { InspectorTabDef, Story } from '../../types';
import { isPrismStory } from '../story-types';
import { StatsTab } from './stats-tab';
import { CompiledTab } from './compiled-tab';

// Chrome provides the Source tab. Prism adds Stats + Compiled.
export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  if (!isPrismStory(story)) return [];
  return [
    { id: 'stats', label: 'Stats', render: () => <StatsTab story={story} /> },
    { id: 'compiled', label: 'Compiled', render: () => <CompiledTab story={story} /> },
  ];
};
