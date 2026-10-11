import type { DocumentStore } from '@niscorp/strata/postgres';

// ═══════════════════════════════════════════════════════════════
// THE TABLES THE FEATURE KEEPS: `integrations` and `integration_actions`.
//
// The core's sequence makes them (`nisc.moss`, ../data): every deployment's
// ledger has them there, and a migration that has run is never moved or
// edited, so their DDL stays where it is. In code they are this feature's: it
// names both as its own (./entries.ts, `REGISTRY_TABLES`), and nothing in the
// core reads or writes a row of them.
// ═══════════════════════════════════════════════════════════════

// THE ROWS THAT HOLD DOCUMENTS: every stored action's definition is a nova
// action, stamped with the grammars it was written in (`{}`, a row with no
// stamp, reads as the start of every grammar). The feature has them brought
// current when it starts (./feature.ts, the `upgradeStore` seam): rows carry
// the stamp they were written at, what they have not seen runs once, and they
// are written back current. A row written by newer code refuses the start,
// as a ledger written by newer code refuses the boot.
export const STORED_ACTIONS: DocumentStore = {
  table: 'integration_actions',
  column: 'definition',
  stamp: 'grammar',
  kind: 'nisc.nova/action',
  key: ['integration_id', 'action_id'],
};
