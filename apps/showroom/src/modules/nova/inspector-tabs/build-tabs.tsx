import type { InspectorTabDef } from '../../types';
import { isNovaStory } from '../story-types';
import { SnippetTab } from './snippet-tab';
import { SourceTab } from './source-tab';
import { RenderTab } from './render-tab';
import { DataTab } from './data-tab';
import { RegistryTab } from './registry-tab';
import { StackTab } from './stack-tab';

export const buildInspectorTabs = (story: unknown): InspectorTabDef[] => {
  if (!isNovaStory(story)) return [];
  const tabs: InspectorTabDef[] = [
    { id: 'snippet', label: 'Snippet', render: () => <SnippetTab story={story} /> },
    { id: 'source', label: 'Source', render: () => <SourceTab story={story} /> },
    { id: 'render', label: 'Render', render: () => <RenderTab /> },
    { id: 'data', label: 'Data', render: () => <DataTab /> },
    { id: 'registry', label: 'Registry', render: () => <RegistryTab /> },
  ];
  if (story.kind === 'shell') {
    tabs.push({ id: 'stack', label: 'Stack', render: () => <StackTab /> });
  }
  return tabs;
};
