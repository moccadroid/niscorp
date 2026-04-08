import type { DocPage, LibraryModule, SidebarStoryEntry } from '../types';
import { isPrismStory } from './story-types';
import { stories } from './stories';
import { Runner } from './runner';
import { PrismRuntimeProvider } from './runtime-context';
import { buildInspectorTabs } from './inspector-tabs/build-tabs';
import { evaluateAll } from './evaluators';

// Documentation lifted directly from packages/prism/*.md via Vite raw imports.
import readmeContent from '../../../../../packages/prism/README.md?raw';
import designContent from '../../../../../packages/prism/DESIGN.md?raw';
import docsContent from '../../../../../packages/prism/DOCS.md?raw';

const docs: readonly DocPage[] = [
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
  { id: 'docs', title: 'Reference', content: docsContent },
];

const KIND_ORDER: readonly string[] = ['transform'];
const KIND_LABELS: Record<string, string> = { transform: 'TRANSFORMS' };

const toSidebarEntry = (story: unknown): SidebarStoryEntry => {
  if (!isPrismStory(story)) {
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

export const prismModule: LibraryModule = {
  id: 'prism',
  name: 'Prism',
  stories,
  toSidebarEntry,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  evaluateAll,
  RuntimeProvider: PrismRuntimeProvider,
  Runner,
  buildInspectorTabs,
  docs,
};
