import type { Filter, Mutation, SeedEntry, SeedMutation } from '@niscorp/vex';

export const REGISTRY_TABLES: readonly string[] = ['integrations', 'integration_actions'];

export const PAGE = 500;

const fromContext = (columns: readonly string[]): Record<string, { $context: string }> => Object.fromEntries(columns.map((column) => [column, { $context: column }]));

const byId: Filter = { eq: ['integrations.id', { $context: 'id' }] };
const approved: Filter = { eq: ['integrations.status', 'approved'] };

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

const importedColumns = {
  ...fromContext(['url', 'requested_actions', 'requested_data', 'reach', 'phrasebook', 'extension', 'last_import_at']),
  last_error: null,
};

// A batch is one transaction: a statement that fails takes the ones before it back.
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

// The key's hash is a statement of its own, written only where the row holds none. Of two
// registrations of one new integration in the same moment, the later waits for the earlier
// one's row and writes nothing; set with the row, it would replace the first key's hash.
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
