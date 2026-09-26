import type { Sequence } from '@niscorp/strata';

// ═══════════════════════════════════════════════════════════════
// Prism's grammar, as a strata sequence — @niscorp/prism/migrations.
//
// One document kind: a transform config, wherever another grammar keeps one (a
// nova endpoint's request and response, a vex entry's mapping). It declares no
// embeddings: a config nests ops, not documents, and a migration that has to
// reach an op at any depth needs Prism to walk its own tree (`$walk`, strata S3).
//
// Version 0 is the grammar as it stood when strata arrived. The standing rule is
// stronger than for most grammars: a Prism op is never removed or reshaped —
// the old form stays as sugar that desugars to the new — so configs stored as
// migrations never need migrating themselves. This sequence exists for the day
// that rule cannot hold.
// ═══════════════════════════════════════════════════════════════

export const PRISM_SEQUENCE: Sequence = {
  id: 'nisc.prism',
  documents: { config: {} },
  migrations: [],
};
