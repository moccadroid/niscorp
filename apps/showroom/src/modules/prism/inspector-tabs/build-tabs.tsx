import type { InspectorTabDef, Story } from '@showroom/modules/types';
import { stories } from '@showroom/modules/prism/stories';
import { StatsTab } from './stats-tab';
import { CompiledTab } from './compiled-tab';

// Chrome provides the Source tab. Prism adds Stats + Compiled. The story's
// input and config ride on the PrismStory; finding it by id needs no cast.
export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  const s = stories.find((x) => x.id === story.id);
  if (s === undefined) return [];
  return [
    { id: 'stats', label: 'Stats', render: () => <StatsTab story={s} /> },
    { id: 'compiled', label: 'Compiled', render: () => <CompiledTab story={s} /> },
  ];
};
