import type { InspectorTabDef, Story } from '@showroom/modules/types';
import { stories } from '@showroom/modules/prism/stories';
import { StatsTab } from './stats-tab';
import { CompiledTab } from './compiled-tab';

export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  const s = stories.find((x) => x.id === story.id);
  if (s === undefined) return [];
  return [
    { id: 'stats', label: 'Stats', render: () => <StatsTab story={s} /> },
    { id: 'compiled', label: 'Compiled', render: () => <CompiledTab story={s} /> },
  ];
};
