import type { DocPage, LibraryModule } from '@showroom/modules/types';

import readmeContent from '../../../../../packages/moss/README.md?raw';
import designContent from '../../../../../packages/moss/DESIGN.md?raw';
import docsContent from '../../../../../packages/moss/DOCS.md?raw';

const docs: readonly DocPage[] = [
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
  { id: 'docs', title: 'Reference', content: docsContent },
];

export const mossModule: LibraryModule = {
  id: 'moss',
  name: 'Moss',
  stories: [],
  kindOrder: [],
  kindLabels: {},
  docs,
};
