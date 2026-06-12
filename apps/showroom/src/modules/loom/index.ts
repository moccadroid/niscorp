import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { stories } from './stories';
import { buildInspectorTabs } from './inspector-tabs/build-tabs';

import readmeContent from '../../../../../packages/loom/README.md?raw';
import designContent from '../../../../../packages/loom/DESIGN.md?raw';

const docs: readonly DocPage[] = [
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
];

const KIND_ORDER: readonly string[] = ['basics', 'structure', 'resolver', 'plugins'];

const KIND_LABELS: Record<string, string> = {
  basics: 'Basics',
  structure: 'Structure',
  resolver: 'Resolver',
  plugins: 'Plugins',
};

export const loomModule: LibraryModule = {
  id: 'loom',
  name: 'Loom',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  buildInspectorTabs,
  docs,
};
