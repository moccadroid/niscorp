import type { InspectorTabDef } from '../../types';
import { isPrismStory } from '../story-types';
import { StatsTab } from './stats-tab';
import { CompiledTab } from './compiled-tab';
import { SourceTab } from './source-tab';

// Library-specific inspector tabs for prism stories. Input / Config / Output
// also appear in the canvas pane; here the inspector adds the authored
// story file (Source) plus static analysis (Stats) and the post-desugar
// AST (Compiled).
export const buildInspectorTabs = (story: unknown): InspectorTabDef[] => {
  if (!isPrismStory(story)) return [];
  return [
    { id: 'source', label: 'Source', render: () => <SourceTab story={story} /> },
    { id: 'stats', label: 'Stats', render: () => <StatsTab story={story} /> },
    { id: 'compiled', label: 'Compiled', render: () => <CompiledTab story={story} /> },
  ];
};
