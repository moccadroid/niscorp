import type { ActionDefinition } from '@niscorp/nova';
import type { NiscRuntime } from '@niscorp/moss';
import { seedCache } from '@niscorp/vex';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { ENTRIES, MUTATION_ENTRIES } from '@atrium/app/vex';
import { TABLES } from '@atrium/db/schema';
import { resolveStatements } from '@atrium/db/resolve';
import { intakeBundle } from './intake';
import type { IntakeContext, PulledBundle } from './intake';

// ═══════════════════════════════════════════════════════════
// DISCOVERY — the app learns its integrations by PULLING them.
//
// The app ships with zero built-in knowledge of Opera, Mews or HotelFix.
// `syncIntegrations` walks the connector registry, fetches each service's
// `/bundle` (capability matrix, actions, queries, slots, menus, table
// footprint), validates the WHOLE payload at intake, and only then upserts —
// one transaction per connector. A refusal or an unreachable service leaves
// that connector's last-synced rows serving and reports the reasons; the
// others still land.
//
// After the pull, the database is the only source: `loadBundles` reads the
// rows back into `bundleState`, which is what boot hands the manifest and
// what the assistant's knowledge derives from. Shipping an integration is
// deploying ITS service and syncing — this process never restarts.
// ═══════════════════════════════════════════════════════════

const PULL_TIMEOUT_MS = 2500;

// What the rows currently say — the running image of every synced bundle.
// One module-level registry, refilled by loadBundles; readers (the manifest
// merge, the assistant's knowledge) always see the latest sync.
export type BundleState = {
  actions: Record<string, ActionDefinition>;
  entries: (SeedEntry | SeedMutation)[];
};
export const bundleState: BundleState = { actions: {}, entries: [] };

const parseDefinition = (value: unknown): unknown => (typeof value === 'string' ? JSON.parse(value) : value);

export const loadBundles = async (runtime: NiscRuntime): Promise<BundleState> => {
  const actionRows = await runtime.pool.query('SELECT id, definition FROM bundle_actions ORDER BY id', []);
  const actions: Record<string, ActionDefinition> = {};
  for (const row of actionRows.rows) actions[String(row['id'])] = parseDefinition(row['definition']) as ActionDefinition;

  const entryRows = await runtime.pool.query('SELECT fingerprint, definition FROM bundle_entries ORDER BY fingerprint', []);
  const entries = entryRows.rows.map((row) => parseDefinition(row['definition']) as SeedEntry | SeedMutation);

  bundleState.actions = actions;
  bundleState.entries = entries;
  return bundleState;
};

// ─── the pull ────────────────────────────────────────────────

// `kind` separates the two failures that deserve different treatment: a
// service that did not answer is a transient condition worth chasing, a
// payload intake refused is a vendor bug that will still be a bug in thirty
// seconds. Boot retries the first and only the first.
export type SyncReport = { connector: string; ok: boolean; kind: 'ok' | 'unreachable' | 'refused' | 'failed'; reasons: string[] };

// What the last pull said, kept because a report that only reaches the console
// that triggered it cannot answer "is the estate healthy right now". `at: 0`
// means no pull has finished yet, which on a booting process is the truth.
export const lastSync: { at: number; reports: SyncReport[] } = { at: 0, reports: [] };

const pull = async (serviceUrl: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PULL_TIMEOUT_MS);
  try {
    const response = await fetch(`${serviceUrl}/bundle`, { signal: controller.signal });
    if (!response.ok) throw new Error(`the service answered ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

const column = async (runtime: NiscRuntime, sql: string, params: unknown[]): Promise<Set<string>> => {
  const res = await runtime.pool.query(sql, params);
  return new Set(res.rows.map((row) => String(Object.values(row)[0])));
};

const intakeContext = async (runtime: NiscRuntime, connectorId: string): Promise<IntakeContext> => ({
  connectorId,
  coreFingerprints: new Set([...ENTRIES, ...MUTATION_ENTRIES].map((e) => e.fingerprint)),
  foreignFingerprints: await column(runtime, 'SELECT fingerprint FROM bundle_entries WHERE connector_id <> $1', [connectorId]),
  foreignActionIds: await column(runtime, 'SELECT id FROM bundle_actions WHERE connector_id <> $1', [connectorId]),
  foreignSlotIds: await column(runtime, 'SELECT id FROM surface_slots WHERE source <> $1', [connectorId]),
  capabilityVocabulary: await column(runtime, 'SELECT id FROM capabilities', []),
  schemaTables: new Set(TABLES),
});

// The transactional upsert — everything one connector's bundle owns, replaced
// in one go. Capability switches are the ONE thing preserved: the vendor
// console owns `enabled`, so an existing row only takes the new version, and
// only rows for capabilities the service no longer reports are dropped.
const land = async (runtime: NiscRuntime, connectorId: string, bundle: PulledBundle): Promise<void> => {
  const versionOf = new Map(bundle.capabilities.map((c) => [c.id, c.version]));
  const existing = await column(runtime, 'SELECT capability_id FROM connector_capabilities WHERE connector_id = $1', [connectorId]);

  await runtime.pool.query('BEGIN', []);
  try {
    for (const cap of bundle.capabilities) {
      await runtime.pool.query(
        `INSERT INTO connector_capabilities (id, connector_id, version, capability_id, enabled)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version`,
        [`${connectorId}:${cap.id}`, connectorId, cap.version, cap.id, cap.enabled],
      );
    }
    for (const stale of existing) {
      if (!versionOf.has(stale)) await runtime.pool.query('DELETE FROM connector_capabilities WHERE connector_id = $1 AND capability_id = $2', [connectorId, stale]);
    }

    await runtime.pool.query('DELETE FROM bundle_actions WHERE connector_id = $1', [connectorId]);
    for (const [id, definition] of Object.entries(bundle.actions)) {
      await runtime.pool.query('INSERT INTO bundle_actions (id, connector_id, audience, definition) VALUES ($1, $2, $3, $4)', [id, connectorId, id.split('.')[1] ?? '', JSON.stringify(definition)]);
    }

    await runtime.pool.query('DELETE FROM bundle_entries WHERE connector_id = $1', [connectorId]);
    for (const entry of [...bundle.queries, ...bundle.mutations]) {
      await runtime.pool.query('INSERT INTO bundle_entries (fingerprint, connector_id, definition) VALUES ($1, $2, $3)', [entry.fingerprint, connectorId, JSON.stringify(entry)]);
    }

    // Slots are replaced wholesale, so the OPERATOR's switch has to survive the
    // replacement — exactly like `connector_capabilities.enabled` above. A
    // surface we withdrew stays withdrawn when its vendor re-ships it; a pull
    // is not a way to undo our own decision.
    const withdrawn = await column(runtime, 'SELECT id FROM surface_slots WHERE source = $1 AND enabled = false', [connectorId]);
    await runtime.pool.query('DELETE FROM surface_slots WHERE source = $1', [connectorId]);
    for (const [audience, id, actionId, title, blurb, icon, capability, stayState, keywords, canvas, position] of bundle.slots) {
      await runtime.pool.query(
        `INSERT INTO surface_slots (audience, id, action_id, title, blurb, icon, capability_id, stay_state, keywords, source, canvas, position, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [audience, id, actionId, title, blurb, icon, capability, stayState, keywords, connectorId, canvas, position, !withdrawn.has(id)],
      );
    }

    await runtime.pool.query('DELETE FROM request_options WHERE connector_id = $1', [connectorId]);
    let position = 0;
    for (const [capability, label, detail, icon, kind, amount, pos] of bundle.options) {
      position += 1;
      await runtime.pool.query(
        `INSERT INTO request_options (id, connector_id, version, capability_id, label, detail, icon, kind, amount, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [`ro_${connectorId}_${position}`, connectorId, versionOf.get(capability) ?? 1, capability, label, detail, icon, kind, amount, pos],
      );
    }

    for (const statement of resolveStatements(connectorId)) await runtime.pool.query(statement, []);
    await runtime.pool.query('COMMIT', []);
  } catch (error) {
    await runtime.pool.query('ROLLBACK', []);
    throw error;
  }
};

// Pull one connector (or all of them), gate, land, reseed, refresh. The
// returned reports are the console's material: per connector, landed or the
// exact reasons it did not.
export const syncIntegrations = async (runtime: NiscRuntime, connectorId?: string): Promise<SyncReport[]> => {
  const where = connectorId === undefined ? '' : ' WHERE id = $1';
  const connectors = await runtime.pool.query(`SELECT id, service_url FROM connectors${where} ORDER BY id`, connectorId === undefined ? [] : [connectorId]);

  const reports: SyncReport[] = [];
  let landed = false;
  for (const row of connectors.rows) {
    const id = String(row['id']);
    let payload: unknown;
    try {
      payload = await pull(String(row['service_url']));
    } catch (error) {
      reports.push({
        connector: id,
        ok: false,
        kind: 'unreachable',
        reasons: [`unreachable — ${error instanceof Error && error.name === 'AbortError' ? 'no answer in time' : error instanceof Error ? error.message : 'fetch failed'}; last-synced rows keep serving`],
      });
      continue;
    }

    const { bundle, errors } = intakeBundle(payload, await intakeContext(runtime, id));
    if (bundle === null) {
      reports.push({ connector: id, ok: false, kind: 'refused', reasons: errors });
      continue;
    }

    // The fingerprints this connector owned BEFORE the pull: cleared from the
    // cache after the rows land, so a changed query re-seeds instead of being
    // skipped as already-present, and a dropped one stops serving.
    const before = await column(runtime, 'SELECT fingerprint FROM bundle_entries WHERE connector_id = $1', [id]);
    try {
      await land(runtime, id, bundle);
    } catch (error) {
      reports.push({
        connector: id,
        ok: false,
        kind: 'failed',
        reasons: [`upsert failed — ${error instanceof Error ? error.message : String(error)}; rolled back, old rows keep serving`],
      });
      continue;
    }
    // A runtime without a cache serves no fingerprints at all, so there is
    // nothing to re-seed — the rows still landed.
    const cache = runtime.cache;
    if (cache !== undefined) {
      for (const fingerprint of before) await cache.delete(fingerprint);
      await seedCache(cache, [...bundle.queries, ...bundle.mutations]);
    }

    reports.push({ connector: id, ok: true, kind: 'ok', reasons: [] });
    landed = true;
  }

  // One reload + refresh for the whole pass: rows → bundleState → the running
  // manifest, memos dropped, living shells adopt.
  if (landed) {
    await loadBundles(runtime);
    await refreshServer();
  }
  lastSync.at = Date.now();
  lastSync.reports = reports;
  return reports;
};

// ─── the refresh seam ────────────────────────────────────────
// boot() registers the whole reload: re-read the bundle rows into the running
// manifest, then moss's refresh() (re-verify → drop memos → shells adopt).
// One module-level slot — the same shape as the directory snapshot in
// users.ts.
let refreshFn: (() => Promise<void>) | undefined;

export const registerRefresh = (fn: () => Promise<void>): void => {
  refreshFn = fn;
};

// Re-load and re-verify the running server. Throws if the new artifact set is
// incoherent — the caller surfaces that as an ordinary failed call and the old
// resolution keeps serving.
export const refreshServer = async (): Promise<void> => {
  await refreshFn?.();
};
