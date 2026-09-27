import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { createElement } from 'react';
import { stories } from './stories';
import { Intro } from './pages/intro';

import readmeContent from '../../../../../packages/charter/README.md?raw';
import designContent from '../../../../../packages/charter/DESIGN.md?raw';
import docsContent from '../../../../../packages/charter/DOCS.md?raw';

// Charter decides what each person's app is and what the database will tell
// them. The pages follow one made-up studio; the resolver, the verifier, vex's
// handler and Postgres (PGlite, in the page) are real.
const docs: readonly DocPage[] = [
  { id: 'start', title: 'What charter is for', render: () => createElement(Intro) },
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
  { id: 'docs', title: 'Reference', content: docsContent },
];

const KIND_ORDER: readonly string[] = ['studio'];
const KIND_LABELS: Record<string, string> = { studio: 'ACME STUDIO' };

export const charterModule: LibraryModule = {
  id: 'charter',
  name: 'Charter',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  docs,
};
