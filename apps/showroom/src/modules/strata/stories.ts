import type { Story } from '@showroom/modules/types';

import * as ledger from './stories/ledger.demo';
import ledgerSrc from './stories/ledger.demo?raw';
import * as adopt from './stories/adopt.demo';
import adoptSrc from './stories/adopt.demo?raw';
import * as upgrade from './stories/upgrade.demo';
import upgradeSrc from './stories/upgrade.demo?raw';
import * as embeddings from './stories/embeddings.demo';
import embeddingsSrc from './stories/embeddings.demo?raw';
import * as tooNew from './stories/too-new.demo';
import tooNewSrc from './stories/too-new.demo?raw';

export const stories: readonly Story[] = [
  {
    id: 'ledger',
    name: 'The ledger',
    description: 'An app\'s tables as a sequence. Boot, boot again, then change the code — append, reword, edit history, break a step, roll back — and watch what strata allows.',
    category: 'Tables',
    kind: 'tables',
    Demo: ledger.Demo,
    source: ledgerSrc,
  },
  {
    id: 'adopt',
    name: 'Adopt an old database',
    description: 'A vex cache from before strata, missing five later columns and holding two rows. The real baseline vex ships converges it once and records it.',
    category: 'Tables',
    kind: 'tables',
    Demo: adopt.Demo,
    source: adoptSrc,
  },
  {
    id: 'upgrade',
    name: 'Upgrade a document',
    description: 'A nova action stored before the app kit renamed Button\'s label. One Prism migration over one node runs on every Button at every depth, and the document comes back stamped current.',
    category: 'Documents',
    kind: 'documents',
    Demo: upgrade.Demo,
    source: upgradeSrc,
  },
  {
    id: 'embeddings',
    name: 'Embeddings',
    description: 'Where nova\'s grammar says its documents nest — and so everything the walker finds inside one action: layouts at every depth, and the Prism config in its endpoint.',
    category: 'Documents',
    kind: 'documents',
    Demo: embeddings.Demo,
    source: embeddingsSrc,
  },
  {
    id: 'too-new',
    name: 'Too new',
    description: 'A document written by newer code than the reader. Refused by name, before anything renders — the reader upgrades first.',
    category: 'Documents',
    kind: 'documents',
    Demo: tooNew.Demo,
    source: tooNewSrc,
  },
];
