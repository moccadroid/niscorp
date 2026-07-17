import type { Story } from '@showroom/modules/types';

import * as resolve from './stories/resolve.demo';
import resolveSrc from './stories/resolve.demo?raw';
import * as deny from './stories/deny.demo';
import denySrc from './stories/deny.demo?raw';
import * as universes from './stories/universes.demo';
import universesSrc from './stories/universes.demo?raw';
import * as deadDeny from './stories/dead-deny.demo';
import deadDenySrc from './stories/dead-deny.demo?raw';
import * as incoherent from './stories/incoherent.demo';
import incoherentSrc from './stories/incoherent.demo?raw';
import * as principal from './stories/principal.demo';
import principalSrc from './stories/principal.demo?raw';

export const stories: readonly Story[] = [
  {
    id: 'resolve',
    name: 'Resolve',
    description: 'Roles → a concrete id set. extends composes, globs select, deny wins. Granted ids highlighted; ungranted are absent.',
    category: 'Resolve',
    kind: 'resolve',
    Demo: resolve.Demo,
    source: resolveSrc,
  },
  {
    id: 'deny',
    name: 'Deny wins',
    description: 'A broad allow minus a deny — set-minus, order-independent. Denies do not inherit; a child may re-add.',
    category: 'Resolve',
    kind: 'resolve',
    Demo: deny.Demo,
    source: denySrc,
  },
  {
    id: 'universes',
    name: 'Two universes',
    description: 'The same engine resolves action ids and table.verb capabilities. Universe-blind: it never learns what a string means.',
    category: 'Resolve',
    kind: 'resolve',
    Demo: universes.Demo,
    source: universesSrc,
  },
  {
    id: 'dead-deny',
    name: 'Dead deny (refused)',
    description: 'A deny that matches nothing is an ERROR — silent means unprotected. A dead allow is only a warning.',
    category: 'Verify',
    kind: 'verify',
    Demo: deadDeny.Demo,
    source: deadDenySrc,
  },
  {
    id: 'incoherent',
    name: 'Ambiguous & orphan',
    description: 'Sugar plus an explicit section is ambiguous (error); an action no role grants is an orphan (warning).',
    category: 'Verify',
    kind: 'verify',
    Demo: incoherent.Demo,
    source: incoherentSrc,
  },
  {
    id: 'principal',
    name: 'Principal walk',
    description: 'A principal wears roles; the grant is their union. Roles are orthogonal — admin does not imply dev.',
    category: 'Principal',
    kind: 'principal',
    Demo: principal.Demo,
    source: principalSrc,
  },
];
