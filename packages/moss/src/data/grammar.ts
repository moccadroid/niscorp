import { createUpgrader, type Sequence, type Upgrader } from '@niscorp/strata';
import { NOVA_SEQUENCE } from '@niscorp/nova/migrations';
import { evaluate } from '@niscorp/prism';
import { PRISM_SEQUENCE } from '@niscorp/prism/migrations';

// ═══════════════════════════════════════════════════════════════
// The grammars a moss deployment reads and writes documents in: nova's (its
// actions, fragments and layouts), Prism's (the configs inside them), and the
// app's own (`NiscApp.grammars` — its component kit's props, say). One upgrader
// over all of them, built at boot: it brings stored rows current, upgrades what
// an add-on submits from the stamp the add-on declares, and stamps what moss
// writes.
//
// A document migration is a Prism config, evaluated by Prism's own migration
// transform — the engine that runs an endpoint's request, the same safety (no
// code runs).
// ═══════════════════════════════════════════════════════════════

// nova's and Prism's grammars, then the app's own, in that order.
export const grammarsOf = (app: { grammars?: readonly Sequence[] }): readonly Sequence[] => [
  NOVA_SEQUENCE,
  PRISM_SEQUENCE,
  ...(app.grammars ?? []),
];

export const createGrammarUpgrader = (app: { grammars?: readonly Sequence[] }): Promise<Upgrader> =>
  createUpgrader(grammarsOf(app), { transform: evaluate });
