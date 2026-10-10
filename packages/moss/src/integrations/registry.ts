import { z } from 'zod';
import { migrate } from '@niscorp/strata/postgres';
import { StrataError, depthRefusal, exceedsDepth, type Upgrader } from '@niscorp/strata';
import { ActionDefinitionSchema } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';
import type { PgPool } from '@niscorp/vex';
import { MOSS_SEQUENCE } from '../data';
import type { Bundle } from './bundle';
import { hashIntegrationKey } from './credentials';
import { reachOf } from './reach';

// ═══════════════════════════════════════════════════════════════
// THE REGISTRY — every statement on `integrations` and `integration_actions`,
// each behind a function named for what it does. Nothing else in this feature
// holds SQL, so what is asked of these two tables is read in one file.
//
// They go to the pool, not through vex: that is debt, counted by
// `pnpm check:raw-sql` and due to become vex entries. One of them stays as it
// is: the key lookup runs before there is a principal to run it as.
// ═══════════════════════════════════════════════════════════════

// The tables these rows live in are moss's own sequence (../data, tables.ts).
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

// What the proxy may forward and which pages may be framed, as the row holds
// them. A row from before either column held this shape admits nothing, which
// is what an empty one says.
const ReachSchema = z.record(z.string(), z.array(z.string())).catch({});
const FramesSchema = z.record(z.string(), z.string()).catch({});

const FoundRowSchema = z.object({ url: z.string(), status: z.string(), reach: ReachSchema, frames: FramesSchema });
const StandingRowSchema = z.object({ status: z.string(), key_hash: z.string().nullish() });
const RequestedRowSchema = z.object({ requested_data: strings });

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

// ── one integration: found, taken in, approved, removed ──────

// An integration as it is found by its id: where its service is, whether it
// has been approved ('approved', or it is served nothing), and what the proxy
// and the frame door may let through for it.
export type FoundIntegration = z.infer<typeof FoundRowSchema>;

// Written once. Every door that forwards to an integration starts here, and so
// does the operator's probe.
export const findIntegration = async (pool: PgPool, id: string): Promise<FoundIntegration | undefined> => {
  const res = await pool.query('SELECT url, status, reach, frames FROM integrations WHERE id = $1', [id]);
  return FoundRowSchema.optional().parse(res.rows[0]);
};

// AN IMPORT THAT DID NOT LAND, kept on the row so the operator's list says
// why. The address is kept as given: the next import is fetched from it.
// Whatever the last good import wrote stays, and keeps serving.
export const recordFailedImport = async (pool: PgPool, id: string, url: string, error: string): Promise<void> => {
  await pool.query(
    `INSERT INTO integrations (id, url, last_error) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url, last_error = EXCLUDED.last_error`,
    [id, url, error],
  );
};

// How an integration stands when a bundle for it arrives again: whether it
// was approved, so its actions are being served; and whether it was already
// issued a key, so none is minted. One that was never registered is neither.
export const standingOf = async (pool: PgPool, id: string): Promise<{ approved: boolean; holdsKey: boolean }> => {
  const res = await pool.query('SELECT status, key_hash FROM integrations WHERE id = $1', [id]);
  const row = StandingRowSchema.optional().parse(res.rows[0]);
  return { approved: row?.status === 'approved', holdsKey: typeof row?.key_hash === 'string' && row.key_hash !== '' };
};

export type Landing = {
  id: string;
  url: string;
  // the bundle intake let in
  bundle: Bundle;
  // the sentence both decision screens print (./placements.ts)
  adds: string;
  // The urls the HOST answered with when the press was copied (./press.ts) —
  // the declared paths died the moment the bytes crossed.
  press: readonly string[];
  // The grammars the definitions are written in: this code's, since intake
  // upgraded every one of them.
  stamp: Upgrader['stamp'];
};

const LAND_INTEGRATION = `INSERT INTO integrations (id, url, title, tagline, description, adds, settings_action, requested_actions, requested_data, reach, frames, phrasebook, story, highlights, press, offers, needs, capabilities, configuration, documents, assistants, last_import_at, last_error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, now(), NULL)
       ON CONFLICT (id) DO UPDATE SET url = EXCLUDED.url,
         title = EXCLUDED.title, tagline = EXCLUDED.tagline, description = EXCLUDED.description,
         adds = EXCLUDED.adds, settings_action = EXCLUDED.settings_action,
         requested_actions = EXCLUDED.requested_actions,
         requested_data = EXCLUDED.requested_data,
         reach = EXCLUDED.reach, frames = EXCLUDED.frames,
         phrasebook = EXCLUDED.phrasebook,
         story = EXCLUDED.story, highlights = EXCLUDED.highlights, press = EXCLUDED.press,
         offers = EXCLUDED.offers, needs = EXCLUDED.needs,
         capabilities = EXCLUDED.capabilities,
         configuration = EXCLUDED.configuration,
         documents = EXCLUDED.documents,
         assistants = EXCLUDED.assistants,
         last_import_at = now(), last_error = NULL`;

// The row a bundle is kept as, in the order the statement above names its
// columns.
const landedRow = ({ id, url, bundle, adds, press }: Landing): unknown[] => [
  id,
  url,
  bundle.meta.title,
  bundle.meta.tagline,
  bundle.meta.description,
  adds,
  bundle.settings,
  JSON.stringify(bundle.grants.actions),
  JSON.stringify(bundle.grants.data),
  // Re-derived on every import, so a screen an integration DROPPED takes its
  // endpoint's reach with it. An allow-list that only ever grows is a
  // list of everything the integration has ever been able to do.
  JSON.stringify(reachOf(bundle, id)),
  JSON.stringify(bundle.frames),
  // The integration's own words, in the languages it speaks — stored beside
  // its actions so the app's language pass can reach them, and
  // re-imported whole like everything else about a bundle.
  JSON.stringify(bundle.phrasebook),
  JSON.stringify(bundle.meta.story),
  JSON.stringify(bundle.meta.highlights),
  JSON.stringify(press),
  // What it tells and hears — carried, never read here; the host's bus
  // is the consumer.
  JSON.stringify(bundle.offers),
  JSON.stringify(bundle.needs),
  // The verbs it gates on — carried the same way; the host's role editor
  // is the consumer.
  JSON.stringify(bundle.capabilities),
  // What a builder may set — carried the same way; the host's per-product
  // settings form is the consumer, and the delivery is the assertion's.
  JSON.stringify(bundle.configuration),
  // What an add-on lets a person edit — carried the same way; the host's
  // editor is the consumer.
  JSON.stringify(bundle.documents),
  // What an add-on's assistant knows — carried the same way; the host's
  // assistant is the consumer.
  JSON.stringify(bundle.assistants),
];

// LAND A BUNDLE: the integration's row as the bundle says it is now, and its
// actions in place of whatever it shipped before. Three kinds of statement
// and no transaction around them, as it has always been.
export const landBundle = async (pool: PgPool, landing: Landing): Promise<void> => {
  const { id, bundle } = landing;
  await pool.query(LAND_INTEGRATION, landedRow(landing));
  await pool.query('DELETE FROM integration_actions WHERE integration_id = $1', [id]);
  for (const [actionId, definition] of Object.entries(bundle.actions)) {
    const binding = bundle.attachments[actionId];
    const attachTo = binding === undefined ? '' : typeof binding === 'string' ? binding : binding.to;
    const preview = binding === undefined || typeof binding === 'string' ? '' : binding.preview;
    await pool.query(
      // Stamped current: intake upgraded every definition to this code's grammars.
      'INSERT INTO integration_actions (integration_id, action_id, definition, attach_to, preview, place_in, grammar) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb)',
      [id, actionId, JSON.stringify(definition), attachTo, preview, bundle.placements[actionId] ?? '', JSON.stringify(landing.stamp)],
    );
  }
};

// The hash of the key an integration was issued: all the row keeps of it
// (./credentials.ts).
export const keepKeyHash = async (pool: PgPool, id: string, keyHash: string): Promise<void> => {
  await pool.query('UPDATE integrations SET key_hash = $2 WHERE id = $1', [id, keyHash]);
};

// APPROVE: what it asked to read and write becomes what it is granted, and it
// is served from here on. Answers what was granted. `undefined`: there is no
// such integration, and nothing was written.
export const approveIntegration = async (pool: PgPool, id: string): Promise<readonly string[] | undefined> => {
  const res = await pool.query('SELECT requested_data FROM integrations WHERE id = $1', [id]);
  const asked = RequestedRowSchema.optional().parse(res.rows[0]);
  if (asked === undefined) return undefined;
  await pool.query("UPDATE integrations SET status = 'approved', approved_data = $2::jsonb WHERE id = $1", [id, JSON.stringify(asked.requested_data)]);
  return asked.requested_data;
};

// An approval the app could not serve is taken back, with why.
export const setBackToPending = async (pool: PgPool, id: string, error: string): Promise<void> => {
  await pool.query("UPDATE integrations SET status = 'pending', last_error = $2 WHERE id = $1", [id, error]);
};

// The row goes, and its actions with it (the table's own cascade), and with
// the row the key that was hashed on it.
export const removeIntegration = async (pool: PgPool, id: string): Promise<void> => {
  await pool.query('DELETE FROM integrations WHERE id = $1', [id]);
};

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
