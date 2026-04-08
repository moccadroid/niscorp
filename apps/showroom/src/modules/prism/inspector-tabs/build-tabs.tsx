import type { InspectorTabDef } from '../../types';
import { isPrismStory } from '../story-types';
import { StatsTab } from './stats-tab';
import { CompiledTab } from './compiled-tab';

// Library-specific inspector tabs for prism stories. Input / Config / Output
// are intentionally NOT here — the canvas pane already shows them. The
// inspector adds value the canvas can't: static analysis (Stats) and the
// post-desugar AST (Compiled).
export const buildInspectorTabs = (story: unknown): InspectorTabDef[] => {
  if (!isPrismStory(story)) return [];
  return [
    { id: 'stats', label: 'Stats', render: () => <StatsTab story={story} /> },
    { id: 'compiled', label: 'Compiled', render: () => <CompiledTab story={story} /> },
  ];
};
