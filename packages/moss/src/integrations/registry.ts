import { z } from 'zod';
import { migrate } from '@niscorp/strata/postgres';
import { StrataError, depthRefusal, exceedsDepth, type Upgrader } from '@niscorp/strata';
import { ActionDefinitionSchema } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';
import type { PgPool } from '@niscorp/vex';
import { MOSS_SEQUENCE } from '../data';
import { hashIntegrationKey } from './credentials';

// The tables these rows live in are moss's own sequence (./data, tables.ts).
// Through the ledger, for a host that is not moss's server (which runs every
// owner's sequence in one pass).
export const initIntegrations = async (pool: PgPool): Promise<void> => {
  await migrate(pool, [MOSS_SEQUENCE]);
};

// ── a row, read where it leaves the database ─────────────────
//
// What a query answers is whatever the driver hands back, so each row is read
// by a schema before anything is done with it. What a bundle declared (its
// capabilities, its documents) is carried here and never read: each is held to
// being a list of objects and no further, and one that is not reads as empty.
const text = z
  .string()
  .nullish()
  .transform((value) => value ?? '');
const strings = z.array(z.string()).catch([]);
const carried = z.array(z.record(z.string(), z.unknown())).catch([]);

// Where an integration is and whether it has been approved.
export const WhereItIsSchema = z.object({ url: z.string(), status: z.string() });

// What the proxy may forward and which pages may be framed, as the row holds
// them. A row from before either column held this shape admits nothing, which
// is what an empty one says.
const ReachSchema = z.record(z.string(), z.array(z.string())).catch({});
const FramesSchema = z.record(z.string(), z.string()).catch({});

// An integration as a route finds it by its id: the columns that route asked
// for, each read as what it is. A column it did not ask for is absent.
export const FoundRowSchema = z.object({ url: z.string().optional(), status: z.string().optional(), reach: ReachSchema, frames: FramesSchema });

// How an integration stands when a bundle for it arrives again.
export const StandingRowSchema = z.object({ status: z.string(), key_hash: z.string().nullish() });

// What it asked to read and write, which an approval grants.
export const RequestedRowSchema = z.object({ requested_data: strings });

const AttachmentRowSchema = z.object({ action_id: z.string(), preview: text });
const PlacementRowSchema = z.object({ action_id: z.string(), place_in: z.string() });
const KeyHolderRowSchema = z.object({ id: z.string() });

const ListedRowSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    status: z.string(),
    title: text,
    tagline: text,
    adds: text,
    settings_action: text,
    requested_actions: strings,
    requested_data: strings,
    approved_data: strings,
    offers: strings,
    needs: strings,
    capabilities: carried,
    configuration: carried,
    documents: carried,
    assistants: carried,
    // A TIMESTAMP IS NOT ALWAYS A DATE. Different drivers hand back a Date, an
    // ISO string, or a number for the same column — PGlite returns a string
    // here, so the Date-only branch this had made every row read 'never', on a
    // field whose entire job is saying when it last worked.
    last_import_at: z.unknown().transform((at) => (at instanceof Date ? at.getTime() : typeof at === 'string' || typeof at === 'number' ? new Date(at).getTime() : null)),
    last_error: z.string().nullish(),
    // A count is a bigint, which one driver hands back as a number and another
    // as text.
    action_count: z
      .union([z.number(), z.string(), z.bigint()])
      .nullish()
      .transform((count) => Number(count ?? 0)),
  })
  .transform((row) => ({
    id: row.id,
    url: row.url,
    status: row.status,
    title: row.title,
    tagline: row.tagline,
    adds: row.adds,
    settingsAction: row.settings_action,
    requestedActions: row.requested_actions,
    requestedData: row.requested_data,
    approvedData: row.approved_data,
    offers: row.offers,
    needs: row.needs,
    capabilities: row.capabilities,
    configuration: row.configuration,
    documents: row.documents,
    assistants: row.assistants,
    lastImportAt: row.last_import_at,
    lastError: row.last_error ?? null,
    actionCount: row.action_count,
  }));

// One integration as the operator's list shows it. `status` is what the row
// says ('pending', 'approved'); the declarations are as they were imported.
export type IntegrationRow = z.infer<typeof ListedRowSchema>;

const StoredActionRowSchema = z.object({ action_id: z.string(), definition: z.unknown(), grammar: z.unknown() });

// ── the bindings, read back for the host's derivations ───────
//
// Approved only, like everything else served from these tables. The app's own
// functions consume these: a hub asks which placed screens it lists, a host
// action asks which panels ride it. The app never parses a bundle.

export const listAttachments = async (pool: PgPool, hostAction: string): Promise<{ actionId: string; preview: string }[]> => {
  const res = await pool.query(
    `SELECT a.action_id, a.preview FROM integration_actions a JOIN integrations i ON i.id = a.integration_id
      WHERE i.status = 'approved' AND a.attach_to = $1 ORDER BY a.action_id`,
    [hostAction],
  );
  return res.rows.map((answered) => {
    const row = AttachmentRowSchema.parse(answered);
    return { actionId: row.action_id, preview: row.preview };
  });
};

export const listPlacements = async (pool: PgPool): Promise<Record<string, string>> => {
  const res = await pool.query(
    `SELECT a.action_id, a.place_in FROM integration_actions a JOIN integrations i ON i.id = a.integration_id
      WHERE i.status = 'approved' AND a.place_in <> ''`,
  );
  const out: Record<string, string> = {};
  for (const answered of res.rows) {
    const row = PlacementRowSchema.parse(answered);
    out[row.action_id] = row.place_in;
  }
  return out;
};

// A presented key, resolved to the integration it names — or nothing.
//
// Approved only: a pending integration holds a key (minted at registration so
// the operator ceremony is one step) but the key opens nothing until somebody
// has said yes, and a revoked or deleted row stops answering here, which is
// what makes removal kill the credential in the same act.
export const integrationByKey = async (pool: PgPool, key: string): Promise<string | undefined> => {
  const res = await pool.query("SELECT id FROM integrations WHERE key_hash = $1 AND status = 'approved'", [hashIntegrationKey(key)]);
  return KeyHolderRowSchema.optional().parse(res.rows[0])?.id;
};

export const listIntegrations = async (pool: PgPool): Promise<IntegrationRow[]> => {
  const res = await pool.query(`
    SELECT i.id, i.url, i.status, i.title, i.tagline, i.adds, i.settings_action,
           i.requested_actions, i.requested_data, i.approved_data,
           i.offers, i.needs, i.capabilities, i.configuration, i.documents, i.assistants,
           i.last_import_at, i.last_error,
           (SELECT count(*) FROM integration_actions a WHERE a.integration_id = i.id) AS action_count
      FROM integrations i ORDER BY i.id
  `);
  return res.rows.map((answered) => ListedRowSchema.parse(answered));
};

// Every approved integration's actions, as the manifest wants them.
// With an upgrader, each definition is read in the host's grammar: boot brings
// the table current (upgradeStore), but a row another process wrote since — one
// running older code — is upgraded here. A row written by NEWER code is not
// served: the action is left out with a sentence, never rendered half-read.
// And what is served is an action: a stored definition is read by nova's
// schema, and one it refuses is left out the same way.
const storedAction = (id: string, definition: unknown): ActionDefinition | undefined => {
  if (exceedsDepth(definition)) {
    console.error(`[moss] integration action "${id}" is not served: ${depthRefusal()}`);
    return undefined;
  }
  const read = ActionDefinitionSchema.safeParse(definition);
  if (read.success) return read.data;
  const first = read.error.issues[0];
  console.error(`[moss] integration action "${id}" is not served: it is not an action nova reads (${first === undefined ? 'no reason given' : `${first.path.join('.') || '(root)'}: ${first.message}`})`);
  return undefined;
};

export const loadIntegrationActions = async (pool: PgPool, upgrader?: Upgrader): Promise<Record<string, ActionDefinition>> => {
  const res = await pool.query(
    `SELECT a.action_id, a.definition, a.grammar FROM integration_actions a
       JOIN integrations i ON i.id = a.integration_id
      WHERE i.status = 'approved'`,
  );
  const out: Record<string, ActionDefinition> = {};
  const keep = (id: string, definition: unknown): void => {
    const action = storedAction(id, definition);
    if (action !== undefined) out[id] = action;
  };
  for (const answered of res.rows) {
    const row = StoredActionRowSchema.parse(answered);
    const id = row.action_id;
    if (upgrader === undefined) {
      keep(id, row.definition);
      continue;
    }
    const stamp = isRecord(row.grammar) ? Object.fromEntries(Object.entries(row.grammar).map(([k, v]) => [k, Number(v)])) : {};
    try {
      keep(id, upgrader.upgrade(row.definition, { kind: 'nisc.nova/action', stamp }).document);
    } catch (error) {
      if (!(error instanceof StrataError)) throw error;
      console.error(`[moss] integration action "${id}" is not served: ${error.message.split('\n')[0] ?? error.code}`);
    }
  }
  return out;
};
