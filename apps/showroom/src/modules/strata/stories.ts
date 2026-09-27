import type { Story } from '@showroom/modules/types';

import { TimeMachine } from './pages/time-machine';
import timeMachineSrc from './pages/time-machine?raw';
import { Everywhere } from './pages/everywhere';
import everywhereSrc from './pages/everywhere?raw';
import { Gate } from './pages/gate';
import gateSrc from './pages/gate?raw';
import { Tables } from './pages/tables';
import tablesSrc from './pages/tables?raw';

// Four pages, read in order — the landing page ("What strata is for", a doc)
// links them. Each is full-width: the migrations and documents are on the page
// itself, so there is no source pane beside it.
export const stories: readonly Story[] = [
  {
    id: 'time-machine',
    name: '1 · The time machine',
    description: 'One screen, saved by one release and opened by another. Upgraded on read, or refused — and what the app shows without strata.',
    category: 'Documents',
    kind: 'documents',
    doc: true,
    Demo: TimeMachine,
    source: timeMachineSrc,
  },
  {
    id: 'everywhere',
    name: '2 · One change, everywhere',
    description: 'Deploy a release; the same document catches up in a database row, in your repo, and over the wire.',
    category: 'Documents',
    kind: 'documents',
    doc: true,
    Demo: Everywhere,
    source: everywhereSrc,
  },
  {
    id: 'gate',
    name: '3 · The gate',
    description: 'Every real screen the lab apps captured, upgraded and parsed in your browser — and what a grammar change without a migration would break.',
    category: 'Documents',
    kind: 'documents',
    doc: true,
    Demo: Gate,
    source: gateSrc,
  },
  {
    id: 'tables',
    name: '4 · The ledger',
    description: 'The same rules for the tables documents live in, side by side with a plain migration counter, on real Postgres.',
    category: 'Tables',
    kind: 'tables',
    doc: true,
    Demo: Tables,
    source: tablesSrc,
  },
];
