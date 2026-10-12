import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { createElement } from 'react';
import { stories } from './stories';
import { Intro } from './pages/intro';

import readmeContent from '../../../../../packages/tide/README.md?raw';
import designContent from '../../../../../packages/tide/DESIGN.md?raw';
import docsContent from '../../../../../packages/tide/DOCS.md?raw';

const docs: readonly DocPage[] = [
  { id: 'start', title: 'What tide is for', render: () => createElement(Intro) },
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
  { id: 'docs', title: 'Reference', content: docsContent },
];

const KIND_ORDER: readonly string[] = ['studio'];
const KIND_LABELS: Record<string, string> = { studio: 'ACME STUDIO' };

export const tideModule: LibraryModule = {
  id: 'tide',
  name: 'Tide',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  docs,
};
