import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { createElement } from 'react';
import { stories } from './stories';
import { Intro } from './pages/intro';

import readmeContent from '../../../../../packages/cortex/README.md?raw';
import designContent from '../../../../../packages/cortex/DESIGN.md?raw';

const docs: readonly DocPage[] = [
  { id: 'start', title: 'What cortex is for', render: () => createElement(Intro) },
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
];

const KIND_ORDER: readonly string[] = ['studio', 'nomodel'];

const KIND_LABELS: Record<string, string> = {
  studio: 'ACME STUDIO',
  nomodel: 'NO MODEL NEEDED',
};

export const cortexModule: LibraryModule = {
  id: 'cortex',
  name: 'Cortex',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  docs,
};
