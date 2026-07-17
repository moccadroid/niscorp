import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { stories } from './stories';

import readmeContent from '../../../../../packages/charter/README.md?raw';
import designContent from '../../../../../packages/charter/DESIGN.md?raw';
import docsContent from '../../../../../packages/charter/DOCS.md?raw';

const docs: readonly DocPage[] = [
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
  { id: 'docs', title: 'Reference', content: docsContent },
];

const KIND_ORDER: readonly string[] = ['resolve', 'verify', 'principal'];
const KIND_LABELS: Record<string, string> = {
  resolve: 'RESOLVE',
  verify: 'VERIFY',
  principal: 'PRINCIPAL',
};

export const charterModule: LibraryModule = {
  id: 'charter',
  name: 'Charter',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  docs,
};
