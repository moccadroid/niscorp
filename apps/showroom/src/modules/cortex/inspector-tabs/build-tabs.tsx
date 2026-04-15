import type { InspectorTabDef, Story } from '../../types';
import { isCortexStory } from '../story-types';
import { AgentTab } from './agent-tab';
import { LastRunTab } from './last-run-tab';
import { PreviewContextTab } from './preview-context-tab';

// Chrome provides the Source tab. Cortex adds Agent / Context / Last run.
//   Agent    — agent internals (system prompt, output schema, mode)
//   Context  — preview the assembled context pack BEFORE the LLM call
//   Last run — most recent agent execution for the active story
export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  if (!isCortexStory(story)) return [];
  return [
    { id: 'agent', label: 'Agent', render: () => <AgentTab story={story} /> },
    { id: 'context', label: 'Context', render: () => <PreviewContextTab story={story} /> },
    { id: 'last-run', label: 'Last run', render: () => <LastRunTab storyId={story.id} /> },
  ];
};
