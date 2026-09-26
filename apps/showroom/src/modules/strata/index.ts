import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { stories } from './stories';

import readmeContent from '../../../../../packages/strata/README.md?raw';
import designContent from '../../../../../packages/strata/DESIGN.md?raw';
import planContent from '../../../../../docs/plans/versioning.md?raw';

// Strata answers `what shape is this data in, and how did it get here`. Every
// story runs the REAL runner against a real Postgres in this page (PGlite), and
// writes the real ledger. A story authors only the code a deployment ships and
// the edits a developer might make to it.
const docs: readonly DocPage[] = [
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
  { id: 'plan', title: 'The plan', content: planContent },
];

const KIND_ORDER: readonly string[] = ['tables'];
const KIND_LABELS: Record<string, string> = { tables: 'TABLES' };

export const strataModule: LibraryModule = {
  id: 'strata',
  name: 'Strata',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  docs,
};
