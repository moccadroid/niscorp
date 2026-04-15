import type { DocPage, LibraryModule } from '../types';
import { stories } from './stories';
import { buildInspectorTabs } from './inspector-tabs/build-tabs';

import readmeContent from '../../../../../packages/solid/README.md?raw';
import designContent from '../../../../../packages/solid/DESIGN.md?raw';

const docs: readonly DocPage[] = [
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
];

export const solidModule: LibraryModule = {
  id: 'solid',
  name: 'Solid',
  stories,
  kindOrder: ['stream-demo'],
  kindLabels: { 'stream-demo': 'Streaming Demos' },
  buildInspectorTabs,
  docs,
};
