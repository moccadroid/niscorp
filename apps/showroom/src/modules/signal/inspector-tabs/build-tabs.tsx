import type { InspectorTabDef, Story } from '@showroom/modules/types';
import { SetupTab } from './setup-tab';
import { StatsTab } from './stats-tab';
import { StreamSetupTab } from './stream-setup-tab';

export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  if (story.kind === 'stream') {
    return [
      { id: 'setup', label: 'Setup', render: () => <StreamSetupTab story={story} /> },
    ];
  }
  if (story.kind !== 'recipe') return [];
  return [
    { id: 'setup', label: 'Setup', render: () => <SetupTab story={story} /> },
    { id: 'stats', label: 'Stats', render: () => <StatsTab /> },
  ];
};
