import type { Filter, Mutation, SeedEntry, SeedMutation } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// THE REGISTRY'S ENTRIES — every read and write on `integrations` and
// `integration_actions`, authored as vex entries, the way an app authors its
// own.
//
// They are the feature's own (../feature, the `ownEntries` seam): seeded where
// no route serves them and replayed in process by ./registry.ts, under a
// policy that admits the feature's tables and no other. So what guards an act
// stays what guarded it (an approval is behind the operator key), and a data
// grant on these tables opens none of them.
//
// What a statement took from the database's clock is handed in by the caller:
// `last_import_at` is a value in the context, not `now()`.
// ═══════════════════════════════════════════════════════════════

// THE TABLES THAT ARE THE FEATURE'S OWN: what it names on itself
// (`Feature.tables.names`, ./feature.ts), so all the policy its entries run
// under admits. ./tables.ts says which sequence makes each.
export const REGISTRY_TABLES: readonly string[] = ['integrations', 'integration_actions'];

// EVERY LIST IS READ A PAGE AT A TIME, in the order of its key, each page
// starting after the last row of the one before (vex has no offset: a page is
// a `gt` on the key). So no list has a number it silently stops at, and this
// one is how many rows a single read carries, nothing more.
export const PAGE = 500;

// Each column set from the context key of its own name.
const fromContext = (columns: readonly string[]): Record<string, { $context: string }> => Object.fromEntries(columns.map((column) => [column, { $context: column }]));

const byId: Filter = { eq: ['integrations.id', { $context: 'id' }] };
const approved: Filter = { eq: ['integrations.status', 'approved'] };

// After the row a page ended on, in the order of an action's key: its
// integration, then its own id. The first page starts after ('', '').
const afterAction: Filter = {
  or: [
    { gt: ['integration_actions.integration_id', { $context: 'after_integration' }] },
    { and: [{ eq: ['integration_actions.integration_id', { $context: 'after_integration' }] }, { gt: ['integration_actions.action_id', { $context: 'after_action' }] }] },
  ],
};
const byActionKey: SeedEntry['dsl']['sort'] = [
  { field: 'integration_actions.integration_id', dir: 'asc' },
  { field: 'integration_actions.action_id', dir: 'asc' },
];

// ── one integration, read ────────────────────────────────────

const find: SeedEntry = {
  fingerprint: 'integrations/find',
  intent: 'Where an integration is, whether it is approved, and what its proxy lets through',
  dsl: { from: ['integrations'], fields: ['integrations.url', 'integrations.status', 'integrations.reach'], filter: byId, limit: 1 },
};

const registration: SeedEntry = {
  fingerprint: 'integrations/registration',
  intent: 'Whether an integration is approved, and whether it was issued a key',
  dsl: { from: ['integrations'], fields: ['integrations.status', 'integrations.key_hash'], filter: byId, limit: 1 },
};

const requested: SeedEntry = {
  fingerprint: 'integrations/requested',
  intent: 'What an integration asked to read and write',
  dsl: { from: ['integrations'], fields: ['integrations.requested_data'], filter: byId, limit: 1 },
};

const byKey: SeedEntry = {
  fingerprint: 'integrations/by-key',
  intent: 'The approved integration a key hash belongs to',
  dsl: { from: ['integrations'], fields: ['integrations.id'], filter: { and: [{ eq: ['integrations.key_hash', { $context: 'key_hash' }] }, approved] }, limit: 1 },
};

// ── one integration, written ─────────────────────────────────

const recordFailedImport: SeedMutation = {
  fingerprint: 'integrations/record-failed-import',
  intent: 'Keep why an import did not land on the row, and the address it was fetched from',
  mutation: {
    op: 'insert',
    table: 'integrations',
    values: fromContext(['id', 'url', 'last_error']),
    onConflict: { target: ['id'], set: fromContext(['url', 'last_error']) },
  },
};

// What a bundle says of its integration. The row is written whole on every
// import: on a row that is there, each of these replaces what it held.
const importedColumns = {
  ...fromContext(['url', 'requested_actions', 'requested_data', 'reach', 'phrasebook', 'extension', 'last_import_at']),
  last_error: null,
};

// LANDING A BUNDLE IS ONE BATCH, and a batch is one transaction: the row as
// the bundle says it is now, the actions it shipped before taken out, and one
// row for each action it ships (`actions`, a list in the context: its id, its
// definition, the grammars it is written in).
// A statement that fails takes the ones before it back, so a bundle lands
// whole or the import before it stays whole.
const writeBundleStatements: Mutation[] = [
  { op: 'insert', table: 'integrations', values: { ...fromContext(['id']), ...importedColumns }, onConflict: { target: ['id'], set: importedColumns } },
  { op: 'delete', table: 'integration_actions', where: { eq: ['integration_actions.integration_id', { $context: 'id' }] } },
  {
    op: 'insertEach',
    table: 'integration_actions',
    items: { $context: 'actions' },
    values: {
      integration_id: { $context: 'id' },
      action_id: { $item: 'action_id' },
      definition: { $item: 'definition' },
      grammar: { $item: 'grammar' },
    },
  },
];

const writeBundle: SeedMutation = {
  fingerprint: 'integrations/write-bundle',
  intent: 'Land a bundle: the row of its integration as the bundle says it is now, and its actions in place of the ones before',
  mutation: writeBundleStatements,
};

// The same, for the import a key is issued with: the hash of the key is on the
// row in the transaction that lands the bundle, or neither is.
//
// THE KEY IS KEPT WHERE NONE IS HELD, AND ONLY THERE. Whoever registers asks
// first how the integration stands, and mints a key when it holds none; two
// registrations of one new integration in the same moment are both told that,
// and both come here with a key. The hash was written with the row, so the
// later of the two wrote over the earlier one's, and both were answered a key
// of which one was dead. It is a statement of its own now, the last of the
// batch, and it writes where the row still holds no key: the later
// transaction waits for the earlier one's row, finds a key on it, and writes
// none. The row that statement answers carries the hash, so whoever landed
// reads off the reply whether its key is the one that was kept (./registry.ts).
const writeBundleAndKeepKey: SeedMutation = {
  fingerprint: 'integrations/write-bundle-and-keep-key',
  intent: 'Land a bundle, and keep the hash of the key its integration is issued with it, where it holds none',
  mutation: [...writeBundleStatements, { op: 'update', table: 'integrations', set: fromContext(['key_hash']), where: { and: [byId, { isNull: 'integrations.key_hash' }] } }],
};

const approve: SeedMutation = {
  fingerprint: 'integrations/approve',
  intent: 'Approve an integration: what it asked to read and write becomes what it is granted',
  mutation: { op: 'update', table: 'integrations', set: { status: 'approved', ...fromContext(['approved_data']) }, where: byId },
};

// An approval, taken back: the integration is as it was before somebody said
// yes, and the row says why. What it was granted stays written beside the
// status that no longer serves it, as it always did.
const setBackToPending: SeedMutation = {
  fingerprint: 'integrations/set-back-to-pending',
  intent: 'Take an approval back, and keep why on the row',
  mutation: { op: 'update', table: 'integrations', set: { status: 'pending', ...fromContext(['last_error']) }, where: byId },
};

const remove: SeedMutation = {
  fingerprint: 'integrations/remove',
  intent: 'Remove an integration; its actions go with the row',
  mutation: { op: 'delete', table: 'integrations', where: byId },
};

// ── the lists ────────────────────────────────────────────────

const list: SeedEntry = {
  fingerprint: 'integrations/list',
  intent: 'Every integration, with what its row keeps of the host app’s own vocabulary, a page at a time',
  dsl: {
    from: ['integrations'],
    fields: [
      'integrations.id',
      'integrations.url',
      'integrations.status',
      'integrations.requested_actions',
      'integrations.requested_data',
      'integrations.approved_data',
      'integrations.extension',
      'integrations.last_import_at',
      'integrations.last_error',
    ],
    filter: { gt: ['integrations.id', { $context: 'after' }] },
    sort: [{ field: 'integrations.id', dir: 'asc' }],
    limit: PAGE,
  },
};

// How many actions each integration ships. Beside the list and not in it: an
// integration that ships none has no row here, and vex joins a list to its
// counts only where both have a row.
const actionCounts: SeedEntry = {
  fingerprint: 'integrations/action-counts',
  intent: 'How many actions each integration ships, a page at a time',
  dsl: {
    from: ['integration_actions'],
    fields: ['integration_actions.integration_id'],
    aggregate: { action_count: { count: '*' } },
    groupBy: ['integration_actions.integration_id'],
    filter: { gt: ['integration_actions.integration_id', { $context: 'after' }] },
    sort: [{ field: 'integration_actions.integration_id', dir: 'asc' }],
    limit: PAGE,
  },
};

const storedActions: SeedEntry = {
  fingerprint: 'integrations/stored-actions',
  intent: 'The stored actions of every approved integration, a page at a time',
  dsl: {
    from: ['integration_actions', 'integrations'],
    fields: ['integration_actions.integration_id', 'integration_actions.action_id', 'integration_actions.definition', 'integration_actions.grammar'],
    filter: { and: [approved, afterAction] },
    sort: byActionKey,
    limit: PAGE,
  },
};

// What one integration shipped, approved or not: read before it is approved,
// to ask whether the app could be served with it.
const actionsOf: SeedEntry = {
  fingerprint: 'integrations/actions-of',
  intent: 'The stored actions of one integration, whether or not it is approved, a page at a time',
  dsl: {
    from: ['integration_actions'],
    fields: ['integration_actions.integration_id', 'integration_actions.action_id', 'integration_actions.definition', 'integration_actions.grammar'],
    filter: { and: [{ eq: ['integration_actions.integration_id', { $context: 'id' }] }, afterAction] },
    sort: byActionKey,
    limit: PAGE,
  },
};

export const REGISTRY_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [
  find,
  registration,
  requested,
  byKey,
  recordFailedImport,
  writeBundle,
  writeBundleAndKeepKey,
  approve,
  setBackToPending,
  remove,
  list,
  actionCounts,
  storedActions,
  actionsOf,
];
