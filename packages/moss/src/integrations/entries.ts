import type { Filter, Mutation, SeedEntry, SeedMutation } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// THE REGISTRY'S ENTRIES — every read and write on `integrations`,
// `integration_actions` and `integration_frame_grants`, authored as vex
// entries, the way an app authors its own.
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
export const REGISTRY_TABLES: readonly string[] = ['integrations', 'integration_actions', 'integration_frame_grants'];

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

// LANDING A BUNDLE IS ONE BATCH, and a batch is one transaction: the row as
// the bundle says it is now, the actions it shipped before taken out, and one
// row for each action it ships (`actions`, a list in the context: its id, its
// definition, where it is attached and placed, the grammars it is written in).
// A statement that fails takes the ones before it back, so a bundle lands
// whole or the import before it stays whole.
const landing: Mutation[] = [
  { op: 'insert', table: 'integrations', values: { ...fromContext(['id']), ...landed }, onConflict: { target: ['id'], set: landed } },
  { op: 'delete', table: 'integration_actions', where: { eq: ['integration_actions.integration_id', { $context: 'id' }] } },
  {
    op: 'insertEach',
    table: 'integration_actions',
    items: { $context: 'actions' },
    values: {
      integration_id: { $context: 'id' },
      action_id: { $item: 'action_id' },
      definition: { $item: 'definition' },
      attach_to: { $item: 'attach_to' },
      preview: { $item: 'preview' },
      place_in: { $item: 'place_in' },
      grammar: { $item: 'grammar' },
    },
  },
];

const writeBundle: SeedMutation = {
  fingerprint: 'integrations/write-bundle',
  intent: 'Land a bundle: the row of its integration as the bundle says it is now, and its actions in place of the ones before',
  mutation: landing,
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
  mutation: [...landing, { op: 'update', table: 'integrations', set: fromContext(['key_hash']), where: { and: [byId, { isNull: 'integrations.key_hash' }] } }],
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

// ── frame grants ─────────────────────────────────────────────
//
// A grant is kept by its hash, with what it opens and when it expires
// (./frame.ts). `now` and `expires_at` are instants the caller hands over.

// The grants whose time is over go when the next one is minted, in the same
// transaction: nothing else sweeps them.
const keepFrameGrant: SeedMutation = {
  fingerprint: 'integrations/keep-frame-grant',
  intent: 'Keep the hash of a frame grant with what it opens and when it expires, and let go of every grant whose time is over',
  mutation: [
    { op: 'delete', table: 'integration_frame_grants', where: { lte: ['integration_frame_grants.expires_at', { $context: 'now' }] } },
    { op: 'insert', table: 'integration_frame_grants', values: fromContext(['grant_hash', 'integration_id', 'principal', 'path', 'expires_at']) },
  ],
};

// One answer for a grant that is unknown, that is another integration's, and
// whose time is over: no row.
const frameGrant: SeedEntry = {
  fingerprint: 'integrations/frame-grant',
  intent: 'What a frame grant opens and for whom, if it is this integration’s and its time is not over',
  dsl: {
    from: ['integration_frame_grants'],
    fields: ['integration_frame_grants.principal', 'integration_frame_grants.path'],
    filter: {
      and: [
        { eq: ['integration_frame_grants.grant_hash', { $context: 'grant_hash' }] },
        { eq: ['integration_frame_grants.integration_id', { $context: 'integration_id' }] },
        { gt: ['integration_frame_grants.expires_at', { $context: 'now' }] },
      ],
    },
    limit: 1,
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
  attachments,
  placements,
  storedActions,
  actionsOf,
  keepFrameGrant,
  frameGrant,
];
