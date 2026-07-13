import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { stories } from './stories';

import readmeContent from '../../../../../packages/cortex/README.md?raw';
import designContent from '../../../../../packages/cortex/DESIGN.md?raw';

// Cortex v2 demos. Every demo runs a real agent through the real loop
// against a real provider (key from Signal → Settings); `preview` is
// the one that works without a key. These demos can't be statically
// verified — they need a live model — so they are a manual gallery.

const docs: readonly DocPage[] = [
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
];

const KIND_ORDER: readonly string[] = ['basics', 'loop', 'gates', 'compose'];

const KIND_LABELS: Record<string, string> = {
  basics: 'Basics',
  loop: 'The loop',
  gates: 'Gates',
  compose: 'Composition',
};

export const cortexModule: LibraryModule = {
  id: 'cortex',
  name: 'Cortex',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  docs,
};
