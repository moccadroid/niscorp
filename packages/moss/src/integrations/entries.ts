import type { Filter, SeedEntry, SeedMutation } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// THE REGISTRY'S ENTRIES — every read and write on `integrations` and
// `integration_actions`, authored as vex entries, the way an app authors its
// own.
//
// They are the feature's own (../feature, the `ownEntries` seam): seeded where
// no route serves them and replayed in process by ./registry.ts, under a
// policy that admits the tables below and no other. So what guards an act
// stays what guarded it (an approval is behind the operator key), and a data
// grant on these tables opens none of them.
//
// What a statement took from the database's clock is handed in by the caller:
// `last_import_at` is a value in the context, not `now()`.
// ═══════════════════════════════════════════════════════════════

// The tables these entries touch: all the policy they run under admits.
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
  intent: 'Where an integration is, whether it is approved, and what its proxy and frame door let through',
  dsl: { from: ['integrations'], fields: ['integrations.url', 'integrations.status', 'integrations.reach', 'integrations.frames'], filter: byId, limit: 1 },
};

const standing: SeedEntry = {
  fingerprint: 'integrations/standing',
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

// What a bundle says of its integration, in the order the table names the
// columns. The row is written whole on every import: on a row that is there,
// each of these replaces what it held.
const landed = {
  ...fromContext([
    'url',
    'title',
    'tagline',
    'description',
    'adds',
    'settings_action',
    'requested_actions',
    'requested_data',
    'reach',
    'frames',
    'phrasebook',
    'story',
    'highlights',
    'press',
    'offers',
    'needs',
    'capabilities',
    'configuration',
    'documents',
    'assistants',
    'last_import_at',
  ]),
  last_error: null,
};

const landRow: SeedMutation = {
  fingerprint: 'integrations/land-row',
  intent: 'The row of an integration as its bundle says it is now',
  mutation: { op: 'insert', table: 'integrations', values: { ...fromContext(['id']), ...landed }, onConflict: { target: ['id'], set: landed } },
};

const dropActions: SeedMutation = {
  fingerprint: 'integrations/drop-actions',
  intent: 'Take out the actions an integration shipped before',
  mutation: { op: 'delete', table: 'integration_actions', where: { eq: ['integration_actions.integration_id', { $context: 'id' }] } },
};

const landAction: SeedMutation = {
  fingerprint: 'integrations/land-action',
  intent: 'One action of a bundle, with where it is attached and placed, stamped with the grammars it is written in',
  mutation: { op: 'insert', table: 'integration_actions', values: fromContext(['integration_id', 'action_id', 'definition', 'attach_to', 'preview', 'place_in', 'grammar']) },
};

const keepKeyHash: SeedMutation = {
  fingerprint: 'integrations/keep-key-hash',
  intent: 'Keep the hash of the key an integration was issued',
  mutation: { op: 'update', table: 'integrations', set: fromContext(['key_hash']), where: byId },
};

const approve: SeedMutation = {
  fingerprint: 'integrations/approve',
  intent: 'Approve an integration: what it asked to read and write becomes what it is granted',
  mutation: { op: 'update', table: 'integrations', set: { status: 'approved', ...fromContext(['approved_data']) }, where: byId },
};

const setBackToPending: SeedMutation = {
  fingerprint: 'integrations/set-back-to-pending',
  intent: 'Take an approval back, with why',
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
  intent: 'Every integration as the operator sees it, a page at a time',
  dsl: {
    from: ['integrations'],
    fields: [
      'integrations.id',
      'integrations.url',
      'integrations.status',
      'integrations.title',
      'integrations.tagline',
      'integrations.adds',
      'integrations.settings_action',
      'integrations.requested_actions',
      'integrations.requested_data',
      'integrations.approved_data',
      'integrations.offers',
      'integrations.needs',
      'integrations.capabilities',
      'integrations.configuration',
      'integrations.documents',
      'integrations.assistants',
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

const attachments: SeedEntry = {
  fingerprint: 'integrations/attachments',
  intent: 'The actions of approved integrations that ride a host action, a page at a time',
  dsl: {
    from: ['integration_actions', 'integrations'],
    fields: ['integration_actions.integration_id', 'integration_actions.action_id', 'integration_actions.preview'],
    filter: { and: [approved, { eq: ['integration_actions.attach_to', { $context: 'attach_to' }] }, afterAction] },
    sort: byActionKey,
    limit: PAGE,
  },
};

const placements: SeedEntry = {
  fingerprint: 'integrations/placements',
  intent: 'The actions of approved integrations that are placed under a menu hub, a page at a time',
  dsl: {
    from: ['integration_actions', 'integrations'],
    fields: ['integration_actions.integration_id', 'integration_actions.action_id', 'integration_actions.place_in'],
    filter: { and: [approved, { neq: ['integration_actions.place_in', ''] }, afterAction] },
    sort: byActionKey,
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

export const REGISTRY_ENTRIES: readonly (SeedEntry | SeedMutation)[] = [
  find,
  standing,
  requested,
  byKey,
  recordFailedImport,
  landRow,
  dropActions,
  landAction,
  keepKeyHash,
  approve,
  setBackToPending,
  remove,
  list,
  actionCounts,
  attachments,
  placements,
  storedActions,
];
