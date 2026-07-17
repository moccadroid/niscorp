import type { DocPage, LibraryModule } from '@showroom/modules/types';

import readmeContent from '../../../../../packages/moss/README.md?raw';
import designContent from '../../../../../packages/moss/DESIGN.md?raw';
import docsContent from '../../../../../packages/moss/DOCS.md?raw';

// Moss — the nisc app server. Docs-only in the showroom: a server needs a
// running process, a database and a socket, so it can't be "shown off" in a
// browser story yet (the live derivation/wire demo is a later tier). The
// documentation lives here so the package sits alongside its siblings.
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
