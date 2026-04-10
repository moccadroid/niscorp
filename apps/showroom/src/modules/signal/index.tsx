import type { DocPage, LibraryModule, SidebarStoryEntry } from '../types';
import { isRecipeStory } from './story-types';
import { stories } from './stories';
import { Runner } from './runner';
import { SignalRuntimeProvider } from './runtime-context';
import { buildInspectorTabs } from './inspector-tabs/build-tabs';
import { evaluateAll } from './evaluators';
import { PlaygroundPane } from './playground/playground-pane';
import { SettingsPane } from './settings/settings-pane';

// Documentation lifted directly from packages/signal/*.md via Vite raw imports.
import readmeContent from '../../../../../packages/signal/README.md?raw';
import designContent from '../../../../../packages/signal/DESIGN.md?raw';
import docsContent from '../../../../../packages/signal/DOCS.md?raw';

const KIND_ORDER: readonly string[] = ['recipe'];
const KIND_LABELS: Record<string, string> = { recipe: 'Recipes' };

const toSidebarEntry = (story: unknown): SidebarStoryEntry => {
  if (!isRecipeStory(story)) {
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

// The doc list mixes markdown content with interactive functional pages.
// The chrome's DocPane dispatches on which field is set: `content` for
// markdown, `render` for interactive pages.
const docs: readonly DocPage[] = [
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
  { id: 'reference', title: 'Reference', content: docsContent },
  { id: 'playground', title: 'Playground', render: () => <PlaygroundPane /> },
  { id: 'settings', title: 'Settings', render: () => <SettingsPane /> },
];

export const signalModule: LibraryModule = {
  id: 'signal',
  name: 'Signal',
  stories,
  toSidebarEntry,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  evaluateAll,
  RuntimeProvider: SignalRuntimeProvider,
  Runner,
  buildInspectorTabs,
  docs,
};
