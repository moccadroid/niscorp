import type { InspectorTabDef, Story } from '@showroom/modules/types';
import type { PrismStory } from '@showroom/modules/prism/story-types';
import { StatsTab } from './stats-tab';
import { CompiledTab } from './compiled-tab';

// Chrome provides the Source tab. Prism adds Stats + Compiled.
// The active module always receives one of its own stories, so we
// cast at entry instead of guarding defensively.
export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  const s = story as PrismStory;
  return [
    { id: 'stats', label: 'Stats', render: () => <StatsTab story={s} /> },
    { id: 'compiled', label: 'Compiled', render: () => <CompiledTab story={s} /> },
  ];
};
