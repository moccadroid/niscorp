import type { Story } from '@showroom/modules/types';

import * as ledger from './stories/ledger.demo';
import ledgerSrc from './stories/ledger.demo?raw';
import * as adopt from './stories/adopt.demo';
import adoptSrc from './stories/adopt.demo?raw';

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
];
