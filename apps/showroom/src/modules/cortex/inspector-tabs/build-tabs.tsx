import type { ToolDefinition } from '@niscorp/cortex';
import type { InspectorTabDef, Story } from '@showroom/modules/types';
import { AgentTab } from './agent-tab';
import { ToolsTab } from './tools-tab';
import { RulesTab } from './rules-tab';
import { LastRunTab } from './last-run-tab';
import { PreviewContextTab } from './preview-context-tab';

// Chrome provides the Source tab. Cortex adds:
//   Agent    — defineAgent({...}) source for this story's agent
//   Tools    — defineTool({...}) source for each tool used (when any)
//   Rules    — defineRule({...}) source for rules-kind stories
//   Context  — preview the assembled context pack BEFORE the LLM call
//   Last run — most recent execution for this story
export const buildInspectorTabs = (story: Story): InspectorTabDef[] => {
  const tabs: InspectorTabDef[] = [
    { id: 'agent', label: 'Agent', render: () => <AgentTab story={story} /> },
  ];

  const tools = story['tools'] as ReadonlyArray<ToolDefinition> | undefined;
  if (tools !== undefined && tools.length > 0) {
    tabs.push({ id: 'tools', label: 'Tools', render: () => <ToolsTab story={story} /> });
  }

  if (story.kind === 'rules') {
    tabs.push({ id: 'rules', label: 'Rules', render: () => <RulesTab story={story} /> });
  }

  tabs.push(
    { id: 'context', label: 'Context', render: () => <PreviewContextTab story={story} /> },
    { id: 'last-run', label: 'Last run', render: () => <LastRunTab storyId={story.id} /> },
  );

  return tabs;
};
