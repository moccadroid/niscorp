import type { InspectorTabDef, Story } from '@showroom/modules/types';
import { SetupTab } from './setup-tab';
import { StatsTab } from './stats-tab';
import { StreamSetupTab } from './stream-setup-tab';

// Chrome provides the Source tab for every story. Signal adds:
//   - Setup (recipe stories): provider/model/systemPrompt/tools/schema
//   - Setup (stream stories): provider/model/systemPrompt/userInput/schema/initial
//   - Stats (recipe stories only): last-run stats from SignalRuntimeProvider
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
