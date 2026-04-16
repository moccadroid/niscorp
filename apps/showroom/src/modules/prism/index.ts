import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { stories } from './stories';
import { buildInspectorTabs } from './inspector-tabs/build-tabs';

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

export const prismModule: LibraryModule = {
  id: 'prism',
  name: 'Prism',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  buildInspectorTabs,
  docs,
};
