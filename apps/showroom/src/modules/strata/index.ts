import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { createElement } from 'react';
import { stories } from './stories';
import { Intro } from './pages/intro';

import readmeContent from '../../../../../packages/strata/README.md?raw';
import designContent from '../../../../../packages/strata/DESIGN.md?raw';

const docs: readonly DocPage[] = [
  { id: 'start', title: 'What strata is for', render: () => createElement(Intro) },
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
];

const KIND_ORDER: readonly string[] = ['documents', 'tables'];
const KIND_LABELS: Record<string, string> = { documents: 'DOCUMENTS', tables: 'THE TABLES THEY LIVE IN' };

export const strataModule: LibraryModule = {
  id: 'strata',
  name: 'Strata',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  docs,
};
