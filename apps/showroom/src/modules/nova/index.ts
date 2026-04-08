import type { DocPage, LibraryModule, SidebarStoryEntry } from '../types';
import { isNovaStory } from './story-types';
import { stories } from './stories';
import { Runner } from './runner';
import { NovaRuntimeProvider } from './runtime-context';
import { buildInspectorTabs } from './inspector-tabs/build-tabs';
import { evaluateAll } from './evaluators';

// Documentation lifted directly from packages/nova/*.md via Vite raw imports.
// Edits happen in the package, the showroom just renders them.
import readmeContent from '../../../../../packages/nova/README.md?raw';
import designContent from '../../../../../packages/nova/DESIGN.md?raw';
import layoutDocsContent from '../../../../../packages/nova/LAYOUT_DOCS.md?raw';
import actionDocsContent from '../../../../../packages/nova/ACTION_DOCS.md?raw';
import shellDocsContent from '../../../../../packages/nova/SHELL_DOCS.md?raw';
import reactDocsContent from '../../../../../packages/nova/REACT_DOCS.md?raw';

const docs: readonly DocPage[] = [
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
  { id: 'layout', title: 'Layout Guide', content: layoutDocsContent },
  { id: 'action', title: 'Action Guide', content: actionDocsContent },
  { id: 'shell', title: 'Shell Guide', content: shellDocsContent },
  { id: 'react', title: 'React Guide', content: reactDocsContent },
];

const KIND_ORDER: readonly string[] = ['layout', 'action', 'shell'];

const KIND_LABELS: Record<string, string> = {
  layout: 'Layouts',
  action: 'Actions',
  shell: 'Shells',
};

const toSidebarEntry = (story: unknown): SidebarStoryEntry => {
  if (!isNovaStory(story)) {
    return { id: '?', name: '?', description: '', category: '?', kind: '?' };
  }
  return {
    id: story.id,
    name: story.name,
    description: story.description,
    category: story.category,
    kind: story.kind,
  };
};

export const novaModule: LibraryModule = {
  id: 'nova',
  name: 'Nova',
  stories,
  toSidebarEntry,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  evaluateAll,
  RuntimeProvider: NovaRuntimeProvider,
  Runner,
  buildInspectorTabs,
  docs,
};
