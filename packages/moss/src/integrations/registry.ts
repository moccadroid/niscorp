import { z } from 'zod';
import { StrataError, depthRefusal, exceedsDepth, type Upgrader } from '@niscorp/strata';
import { ActionDefinitionSchema } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';
import type { Replay } from '../feature';
import type { Bundle } from './bundle';
import { hashIntegrationKey } from './credentials';
import { PAGE } from './entries';
import { reachOf } from './reach';

// ═══════════════════════════════════════════════════════════════
// THE REGISTRY — everything asked of `integrations`, `integration_actions` and
// `integration_frame_grants`, each behind a function named for what it does.
//
// None of it is SQL. Each function replays one of the feature's own entries
// (./entries.ts) through vex, by the `replay` the server hands the feature
// when it starts (../feature, the `ownEntries` seam): reads are vex and writes
// are vex here, as they are in an app. What a replay answers is whatever the
// driver handed back, so every row is read by a schema before it is used.
// ═══════════════════════════════════════════════════════════════

// ── what a replay answers ────────────────────────────────────
//
// A read answers its rows: a list, whatever is in it.
const rowsOf = (answered: unknown): unknown[] => z.array(z.unknown()).parse(answered);

// EVERY ROW OF A LIST. A list entry answers one page, in the order of its key,
// starting after the key it is handed (./entries.ts). `page` replays the page
// after a row, or the first; a page that comes back short is the last.
const everyRow = async <Row>(row: z.ZodType<Row>, page: (after: Row | undefined) => Promise<unknown>, after?: Row): Promise<Row[]> => {
  const rows = rowsOf(await page(after)).map((answered) => row.parse(answered));
  const last = rows.at(-1);
  return rows.length < PAGE || last === undefined ? rows : [...rows, ...(await everyRow(row, page, last))];
};

// A ROW, READ WHERE IT LEAVES THE DATABASE. What a bundle declared (its
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
const RegistrationRowSchema = z.object({ status: z.string(), key_hash: z.string().nullish() });
// What a landing that came with a key wrote: the rows of two tables, of which
// only an integration's carries `key_hash`. One row alone is answered as
// itself, and a write that answers nothing as nothing.
const WrittenRowSchema = z.looseObject({ key_hash: z.string().nullish() });
const WrittenSchema = z.union([z.array(WrittenRowSchema), WrittenRowSchema.transform((row) => [row]), z.undefined().transform(() => [])]);
const RequestedRowSchema = z.object({ requested_data: strings });
const KeyHolderRowSchema = z.object({ id: z.string() });

// An action's key: its integration, then its own id. The order every list of
// actions is paged in.
const actionKey = { integration_id: z.string(), action_id: z.string() };
const afterAction = (last: { integration_id: string; action_id: string } | undefined): Record<string, string> => ({
  after_integration: last?.integration_id ?? '',
  after_action: last?.action_id ?? '',
});

const AttachmentRowSchema = z.object({ ...actionKey, preview: text });
const PlacementRowSchema = z.object({ ...actionKey, place_in: z.string() });
const StoredActionRowSchema = z.object({ ...actionKey, definition: z.unknown(), grammar: z.unknown() });

// A count is a bigint, which one driver hands back as a number and another as
// text.
const ActionCountRowSchema = z.object({ integration_id: z.string(), action_count: z.union([z.number(), z.string(), z.bigint()]).transform((count) => Number(count)) });

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
  }));

// One integration as the operator's list shows it. `status` is what the row
// says ('pending', 'approved'); the declarations are as they were imported.
export type IntegrationRow = z.infer<typeof ListedRowSchema> & { actionCount: number };

// ── one integration: found, taken in, approved, removed ──────

// An integration as it is found by its id: where its service is, whether it
// has been approved ('approved', or it is served nothing), and what the proxy
// and the frame door may let through for it.
export type FoundIntegration = z.infer<typeof FoundRowSchema>;

// Written once. Every door that forwards to an integration starts here, and so
// does the operator's probe.
export const findIntegration = async (replay: Replay, id: string): Promise<FoundIntegration | undefined> =>
  FoundRowSchema.optional().parse(rowsOf(await replay('integrations/find', { id }))[0]);

// AN IMPORT THAT DID NOT LAND, kept on the row so the operator's list says
// why. The address is kept as given: the next import is fetched from it.
// Whatever the last good import wrote stays, and keeps serving.
export const recordFailedImport = async (replay: Replay, id: string, url: string, error: string): Promise<void> => {
  await replay('integrations/record-failed-import', { id, url, last_error: error });
};

// How an integration stands when a bundle for it arrives again: whether it
// was approved, so its actions are being served; and whether it was already
// issued a key, so none is minted. One that was never registered is neither.
export const registrationOf = async (replay: Replay, id: string): Promise<{ approved: boolean; holdsKey: boolean }> => {
  const row = RegistrationRowSchema.optional().parse(rowsOf(await replay('integrations/registration', { id }))[0]);
  return { approved: row?.status === 'approved', holdsKey: typeof row?.key_hash === 'string' && row.key_hash !== '' };
};

export type BundleImport = {
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
  // The hash of the key the integration is issued with this import: all the
  // row keeps of it (./credentials.ts). Absent: no key is issued, and what the
  // row holds of one stays.
  keyHash?: string;
};

// The row a bundle is kept as: each column under its own name, as the entry
// reads them.
const importedRow = ({ id, url, bundle, adds, press }: BundleImport): Record<string, unknown> => ({
  id,
  url,
  title: bundle.meta.title,
  tagline: bundle.meta.tagline,
  description: bundle.meta.description,
  adds,
  settings_action: bundle.settings,
  requested_actions: bundle.grants.actions,
  requested_data: bundle.grants.data,
  // Re-derived on every import, so a screen an integration DROPPED takes its
  // endpoint's reach with it. An allow-list that only ever grows is a
  // list of everything the integration has ever been able to do.
  reach: reachOf(bundle, id),
  frames: bundle.frames,
  // The integration's own words, in the languages it speaks — stored beside
  // its actions so the app's language pass can reach them, and
  // re-imported whole like everything else about a bundle.
  phrasebook: bundle.phrasebook,
  story: bundle.meta.story,
  highlights: bundle.meta.highlights,
  press,
  // What it tells and hears — carried, never read here; the host's bus
  // is the consumer.
  offers: bundle.offers,
  needs: bundle.needs,
  // The verbs it gates on — carried the same way; the host's role editor
  // is the consumer.
  capabilities: bundle.capabilities,
  // What a builder may set — carried the same way; the host's per-product
  // settings form is the consumer, and the delivery is the assertion's.
  configuration: bundle.configuration,
  // What an add-on lets a person edit — carried the same way; the host's
  // editor is the consumer.
  documents: bundle.documents,
  // What an add-on's assistant knows — carried the same way; the host's
  // assistant is the consumer.
  assistants: bundle.assistants,
  // This process's clock: an entry takes its instant from whoever replays it.
  last_import_at: new Date().toISOString(),
});

// LAND A BUNDLE: the integration's row as the bundle says it is now, its
// actions in place of whatever it shipped before, and the hash of its key when
// one is issued with the import. ONE BATCH, so one transaction (./entries.ts):
// it lands whole, or what the import before it wrote is still there, whole.
// They were separate statements, and one that failed part-way left a row that
// said one thing over actions that said another, or over none.
//
// ANSWERS WHETHER THE KEY THIS IMPORT CAME WITH IS THE ONE THE ROW HOLDS. The
// key is kept where the row held none (./entries.ts): `false` when the import
// came with no key, and when another registration of the same integration, in
// the same moment, had its key kept first. The bundle landed either way.
export const writeBundle = async (replay: Replay, imported: BundleImport): Promise<{ keptKey: boolean }> => {
  const { bundle } = imported;
  const actions = Object.entries(bundle.actions).map(([actionId, definition]) => {
    const binding = bundle.attachments[actionId];
    return {
      action_id: actionId,
      definition,
      attach_to: binding === undefined ? '' : typeof binding === 'string' ? binding : binding.to,
      preview: binding === undefined || typeof binding === 'string' ? '' : binding.preview,
      place_in: bundle.placements[actionId] ?? '',
      // Stamped current: intake upgraded every definition to this code's grammars.
      grammar: imported.stamp,
    };
  });
  const said = { ...importedRow(imported), actions };
  if (imported.keyHash === undefined) {
    await replay('integrations/write-bundle', said);
    return { keptKey: false };
  }
  // A batch answers every row its statements wrote, and one row alone as that
  // row. The statement that keeps the key answers the integration's row with
  // the hash on it, and writes no row where a key was held already: so the key
  // was kept exactly when a row that carries its hash came back.
  const written = WrittenSchema.parse(await replay('integrations/write-bundle-and-keep-key', { ...said, key_hash: imported.keyHash }));
  return { keptKey: written.some((row) => row.key_hash === imported.keyHash) };
};

// APPROVE: what it asked to read and write becomes what it is granted, and it
// is served from here on. Answers what was granted. `undefined`: there is no
// such integration, and nothing was written. Whoever calls has asked first
// whether the app could be served with it (`storedActionsOf`).
export const approveIntegration = async (replay: Replay, id: string): Promise<readonly string[] | undefined> => {
  const asked = RequestedRowSchema.optional().parse(rowsOf(await replay('integrations/requested', { id }))[0]);
  if (asked === undefined) return undefined;
  await replay('integrations/approve', { id, approved_data: asked.requested_data });
  return asked.requested_data;
};

// AN APPROVAL, TAKEN BACK: the integration is pending again, and the row
// keeps why (the operator's list shows it as `lastError`). For the approval
// that was asked about, written, and then not taken by the app all the same.
export const setBackToPending = async (replay: Replay, id: string, why: string): Promise<void> => {
  await replay('integrations/set-back-to-pending', { id, last_error: why });
};

// The row goes, and its actions with it (the table's own cascade), and with
// the row the key that was hashed on it.
export const removeIntegration = async (replay: Replay, id: string): Promise<void> => {
  await replay('integrations/remove', { id });
};

// ── frame grants ─────────────────────────────────────────────

// What a frame grant opens: one page of one integration, for one principal.
export type FrameGrant = { integration: string; principal: string; path: string };

const FrameGrantRowSchema = z.object({ principal: z.string(), path: z.string() });

// Keep a grant, by its hash, until `expires`. The grants whose time was over
// at `now` go in the same transaction.
export const keepFrameGrant = async (replay: Replay, grantHash: string, grant: FrameGrant, now: Date, expires: Date): Promise<void> => {
  await replay('integrations/keep-frame-grant', {
    grant_hash: grantHash,
    integration_id: grant.integration,
    principal: grant.principal,
    path: grant.path,
    expires_at: expires.toISOString(),
    now: now.toISOString(),
  });
};

// The grant a hash stands for, if it is this integration's and its time is not
// over at `now`. One answer for unknown, expired and another integration's.
export const frameGrantHeld = async (replay: Replay, grantHash: string, integration: string, now: Date): Promise<FrameGrant | undefined> => {
  const row = FrameGrantRowSchema.optional().parse(rowsOf(await replay('integrations/frame-grant', { grant_hash: grantHash, integration_id: integration, now: now.toISOString() }))[0]);
  return row === undefined ? undefined : { integration, principal: row.principal, path: row.path };
};

// ── the bindings, read back for the host's derivations ───────
//
// Approved only, like everything else served from these tables. The app's own
// functions consume these: a hub asks which placed screens it lists, a host
// action asks which panels ride it. The app never parses a bundle.

// In the order of the action ids, whichever integration each belongs to.
export const listAttachments = async (replay: Replay, hostAction: string): Promise<{ actionId: string; preview: string }[]> => {
  const rows = await everyRow(AttachmentRowSchema, (after) => replay('integrations/attachments', { attach_to: hostAction, ...afterAction(after) }));
  return rows.map((row) => ({ actionId: row.action_id, preview: row.preview })).sort((a, b) => (a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0));
};

export const listPlacements = async (replay: Replay): Promise<Record<string, string>> => {
  const rows = await everyRow(PlacementRowSchema, (after) => replay('integrations/placements', afterAction(after)));
  return Object.fromEntries(rows.map((row) => [row.action_id, row.place_in]));
};

// A presented key, resolved to the integration it names — or nothing.
//
// Approved only: a pending integration holds a key (minted at registration so
// the operator ceremony is one step) but the key opens nothing until somebody
// has said yes, and a revoked or deleted row stops answering here, which is
// what makes removal kill the credential in the same act.
//
// Asked before anybody is signed in. The policy the entries run under names no
// role and reads no scope value, so this goes through vex with the rest.
export const integrationByKey = async (replay: Replay, key: string): Promise<string | undefined> =>
  KeyHolderRowSchema.optional().parse(rowsOf(await replay('integrations/by-key', { key_hash: hashIntegrationKey(key) }))[0])?.id;

// Every integration, in the order of the ids, each with how many actions it
// ships. Two reads: vex has no way to put a count of another table's rows
// beside each row and keep the rows that have none.
export const listIntegrations = async (replay: Replay): Promise<IntegrationRow[]> => {
  const listed = await everyRow(ListedRowSchema, (after) => replay('integrations/list', { after: after?.id ?? '' }));
  const counted = await everyRow(ActionCountRowSchema, (after) => replay('integrations/action-counts', { after: after?.integration_id ?? '' }));
  const counts = new Map(counted.map((row) => [row.integration_id, row.action_count]));
  return listed.map((row) => ({ ...row, actionCount: counts.get(row.id) ?? 0 }));
};

// Every approved integration's actions, as the manifest wants them.
// With an upgrader, each definition is read in the host's grammar: the feature
// brings the table current when it starts (upgradeStore), but a row another process wrote since — one
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
  console.error(
    `[moss] integration action "${id}" is not served: it is not an action nova reads ` +
      `(${first === undefined ? 'no reason given' : `${first.path.join('.') || '(root)'}: ${first.message}`})`,
  );
  return undefined;
};

const actionsIn = (rows: readonly z.infer<typeof StoredActionRowSchema>[], upgrader: Upgrader | undefined): Record<string, ActionDefinition> => {
  const out: Record<string, ActionDefinition> = {};
  const keep = (id: string, definition: unknown): void => {
    const action = storedAction(id, definition);
    if (action !== undefined) out[id] = action;
  };
  for (const row of rows) {
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

export const loadIntegrationActions = async (replay: Replay, upgrader?: Upgrader): Promise<Record<string, ActionDefinition>> =>
  actionsIn(await everyRow(StoredActionRowSchema, (after) => replay('integrations/stored-actions', afterAction(after))), upgrader);

// What ONE integration shipped, approved or not, read the same way: the
// actions that would join the manifest if it were approved now. This is what
// is verified before an approval is written.
export const storedActionsOf = async (replay: Replay, id: string, upgrader?: Upgrader): Promise<Record<string, ActionDefinition>> =>
  actionsIn(await everyRow(StoredActionRowSchema, (after) => replay('integrations/actions-of', { id, ...afterAction(after) })), upgrader);
