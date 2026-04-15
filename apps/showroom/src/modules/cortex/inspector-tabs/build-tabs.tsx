import type { InspectorTabDef } from '../../types';
import { isCortexStory } from '../story-types';
import { AgentTab } from './agent-tab';
import { LastRunTab } from './last-run-tab';
import { SourceTab } from './source-tab';
import { PreviewContextTab } from './preview-context-tab';

// Cortex inspector tabs.
//   Agent    — internals of the Cortex agent driving the demo
//              (system prompt, output schema, mode, retry config)
//   Context  — preview the assembled context pack BEFORE the LLM call
//   Source   — the authored story file + referenced agent definition(s)
//   Last run — most recent agent execution for the active story
// Future: an Observations timeline, an Event Log tab.
export const buildInspectorTabs = (story: unknown): InspectorTabDef[] => {
  if (!isCortexStory(story)) return [];
  return [
    { id: 'agent', label: 'Agent', render: () => <AgentTab story={story} /> },
    { id: 'context', label: 'Context', render: () => <PreviewContextTab story={story} /> },
    { id: 'source', label: 'Source', render: () => <SourceTab story={story} /> },
    { id: 'last-run', label: 'Last run', render: () => <LastRunTab storyId={story.id} /> },
  ];
};
