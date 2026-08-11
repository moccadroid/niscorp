import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { stories } from './stories';

import readmeContent from '../../../../../packages/tide/README.md?raw';
import designContent from '../../../../../packages/tide/DESIGN.md?raw';
import docsContent from '../../../../../packages/tide/DOCS.md?raw';

// Tide answers `when`. Every story here runs the REAL engine against the real
// memory store — the only thing standing in is the outside world, because the
// effects log what they would have sent instead of sending it.
//
// The clock is a control rather than a fact of life, which is not a showroom
// trick: tide reads no wall clock anywhere, so a month of scheduled automation
// runs in the time it takes to click. That is the same property that lets a
// headless check advance time and assert on rows with nothing to sleep on.
const docs: readonly DocPage[] = [
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
  { id: 'docs', title: 'Reference', content: docsContent },
];

const KIND_ORDER: readonly string[] = ['trigger', 'flow', 'semantics'];
const KIND_LABELS: Record<string, string> = {
  trigger: 'TRIGGERS',
  flow: 'FLOWS',
  semantics: 'SEMANTICS',
};

export const tideModule: LibraryModule = {
  id: 'tide',
  name: 'Tide',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  docs,
};
