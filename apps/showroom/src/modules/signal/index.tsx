import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { stories } from './stories';
import { SignalRuntimeProvider } from './runtime-context';
import { buildInspectorTabs } from './inspector-tabs/build-tabs';
import { PlaygroundPane } from './playground/playground-pane';
import { SettingsPane } from './settings/settings-pane';

import readmeContent from '../../../../../packages/signal/README.md?raw';
import designContent from '../../../../../packages/signal/DESIGN.md?raw';
import docsContent from '../../../../../packages/signal/DOCS.md?raw';

const KIND_ORDER: readonly string[] = ['recipe', 'stream'];
const KIND_LABELS: Record<string, string> = { recipe: 'Recipes', stream: 'Streaming' };

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
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  buildInspectorTabs,
  RuntimeProvider: SignalRuntimeProvider,
  docs,
};
