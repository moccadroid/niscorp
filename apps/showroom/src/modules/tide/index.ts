import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { createElement } from 'react';
import { stories } from './stories';
import { Intro } from './pages/intro';

import readmeContent from '../../../../../packages/tide/README.md?raw';
import designContent from '../../../../../packages/tide/DESIGN.md?raw';
import docsContent from '../../../../../packages/tide/DOCS.md?raw';

// Tide answers `when`. Every page runs the REAL engine against the real memory
// store; what stands in is the outside world (a mailer, a payment gateway) and
// the cron it is compared with — both written on the page and labelled.
//
// The clock is a control rather than a fact of life, which is not a showroom
// trick: tide reads no wall clock anywhere, so a month of scheduled automation
// runs in the time it takes to click. That is the same property that lets a
// headless check advance time and assert on rows with nothing to sleep on.
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
