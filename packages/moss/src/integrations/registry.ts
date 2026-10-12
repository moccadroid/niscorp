import { z } from 'zod';
import { StrataError, depthRefusal, exceedsDepth, type Upgrader } from '@niscorp/strata';
import type { DocumentStore } from '@niscorp/strata/postgres';
import { ActionDefinitionSchema } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';
import type { Replay } from '../feature';
import type { Bundle } from './bundle';
import { hashIntegrationKey } from './credentials';
import { PAGE } from './entries';
import { reachOf } from './reach';

const rowsOf = (answered: unknown): unknown[] => z.array(z.unknown()).parse(answered);

const everyRow = async <Row>(row: z.ZodType<Row>, page: (after: Row | undefined) => Promise<unknown>, after?: Row): Promise<Row[]> => {
  const rows = rowsOf(await page(after)).map((answered) => row.parse(answered));
  const last = rows.at(-1);
  return rows.length < PAGE || last === undefined ? rows : [...rows, ...(await everyRow(row, page, last))];
};

const strings = z.array(z.string()).catch([]);

const ReachSchema = z.record(z.string(), z.array(z.string())).catch({});

const FoundRowSchema = z.object({ url: z.string(), status: z.string(), reach: ReachSchema });
const RegistrationRowSchema = z.object({ status: z.string(), key_hash: z.string().nullish() });
const WrittenRowSchema = z.looseObject({ key_hash: z.string().nullish() });
const WrittenSchema = z.union([z.array(WrittenRowSchema), WrittenRowSchema.transform((row) => [row]), z.undefined().transform(() => [])]);
const RequestedRowSchema = z.object({ requested_data: strings });
const KeyHolderRowSchema = z.object({ id: z.string() });

const actionKey = { integration_id: z.string(), action_id: z.string() };
const afterAction = (last: { integration_id: string; action_id: string } | undefined): Record<string, string> => ({
  after_integration: last?.integration_id ?? '',
  after_action: last?.action_id ?? '',
});

const StoredActionRowSchema = z.object({ ...actionKey, definition: z.unknown(), grammar: z.unknown() });

// A count is a bigint, which one driver hands back as a number and another as text.
const ActionCountRowSchema = z.object({ integration_id: z.string(), action_count: z.union([z.number(), z.string(), z.bigint()]).transform((count) => Number(count)) });

const ListedRowSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    status: z.string(),
    requested_actions: strings,
    requested_data: strings,
    approved_data: strings,
    extension: z.unknown(),
    // Drivers hand back a Date, an ISO string or a number for the same column.
    last_import_at: z.unknown().transform((at) => (at instanceof Date ? at.getTime() : typeof at === 'string' || typeof at === 'number' ? new Date(at).getTime() : null)),
    last_error: z.string().nullish(),
  })
  .transform((row) => ({
    id: row.id,
    url: row.url,
    status: row.status,
    requestedActions: row.requested_actions,
    requestedData: row.requested_data,
    approvedData: row.approved_data,
    extension: row.extension ?? null,
    lastImportAt: row.last_import_at,
    lastError: row.last_error ?? null,
  }));

export type IntegrationRow = z.infer<typeof ListedRowSchema> & { actionCount: number };

export type FoundIntegration = z.infer<typeof FoundRowSchema>;

export const findIntegration = async (replay: Replay, id: string): Promise<FoundIntegration | undefined> =>
  FoundRowSchema.optional().parse(rowsOf(await replay('integrations/find', { id }))[0]);

export const recordFailedImport = async (replay: Replay, id: string, url: string, error: string): Promise<void> => {
  await replay('integrations/record-failed-import', { id, url, last_error: error });
};

export const registrationOf = async (replay: Replay, id: string): Promise<{ approved: boolean; holdsKey: boolean }> => {
  const row = RegistrationRowSchema.optional().parse(rowsOf(await replay('integrations/registration', { id }))[0]);
  return { approved: row?.status === 'approved', holdsKey: typeof row?.key_hash === 'string' && row.key_hash !== '' };
};

export type BundleImport = {
  id: string;
  url: string;
  bundle: Bundle;
  extension: unknown;
  stamp: Upgrader['stamp'];
  keyHash?: string;
};

const importedRow = ({ id, url, bundle, extension }: BundleImport): Record<string, unknown> => ({
  id,
  url,
  requested_actions: bundle.grants.actions,
  requested_data: bundle.grants.data,
  reach: reachOf(bundle, id),
  phrasebook: bundle.phrasebook,
  // As JSON text: an extension that is itself a string would be read as JSON, and refused.
  extension: extension === undefined ? null : JSON.stringify(extension),
  last_import_at: new Date().toISOString(),
});

export const writeBundle = async (replay: Replay, imported: BundleImport): Promise<{ keptKey: boolean }> => {
  const { bundle } = imported;
  const actions = Object.entries(bundle.actions).map(([actionId, definition]) => ({ action_id: actionId, definition, grammar: imported.stamp }));
  const said = { ...importedRow(imported), actions };
  if (imported.keyHash === undefined) {
    await replay('integrations/write-bundle', said);
    return { keptKey: false };
  }
  // A batch answers the rows its statements wrote, one alone as itself. The statement that keeps
  // the key writes no row where one was held, so the key was kept exactly when its hash came back.
  const written = WrittenSchema.parse(await replay('integrations/write-bundle-and-keep-key', { ...said, key_hash: imported.keyHash }));
  return { keptKey: written.some((row) => row.key_hash === imported.keyHash) };
};

export const approveIntegration = async (replay: Replay, id: string): Promise<readonly string[] | undefined> => {
  const asked = RequestedRowSchema.optional().parse(rowsOf(await replay('integrations/requested', { id }))[0]);
  if (asked === undefined) return undefined;
  await replay('integrations/approve', { id, approved_data: asked.requested_data });
  return asked.requested_data;
};

export const setBackToPending = async (replay: Replay, id: string, why: string): Promise<void> => {
  await replay('integrations/set-back-to-pending', { id, last_error: why });
};

export const removeIntegration = async (replay: Replay, id: string): Promise<void> => {
  await replay('integrations/remove', { id });
};

export const integrationByKey = async (replay: Replay, key: string): Promise<string | undefined> =>
  KeyHolderRowSchema.optional().parse(rowsOf(await replay('integrations/by-key', { key_hash: hashIntegrationKey(key) }))[0])?.id;

// Two reads: vex cannot put a count of another table's rows beside each row and keep the rows with none.
export const listIntegrations = async (replay: Replay): Promise<IntegrationRow[]> => {
  const listed = await everyRow(ListedRowSchema, (after) => replay('integrations/list', { after: after?.id ?? '' }));
  const counted = await everyRow(ActionCountRowSchema, (after) => replay('integrations/action-counts', { after: after?.integration_id ?? '' }));
  const counts = new Map(counted.map((row) => [row.integration_id, row.action_count]));
  return listed.map((row) => ({ ...row, actionCount: counts.get(row.id) ?? 0 }));
};

const RegisteredRowSchema = z.object({ id: z.string(), url: z.string(), status: z.string(), extension: z.unknown() });

export type RegisteredIntegration<Extension> = { id: string; status: string; url: string; extension: Extension | undefined };

const storedExtension = <Extension>(id: string, stored: unknown, schema: z.ZodType<Extension> | undefined): Extension | undefined => {
  if (schema === undefined || stored === null || stored === undefined) return undefined;
  const read = schema.safeParse(stored);
  if (read.success) return read.data;
  const first = read.error.issues[0];
  console.error(`[moss] the stored extension of integration "${id}" is not read: ${first === undefined ? 'no reason given' : `${first.path.join('.') || '(root)'}: ${first.message}`}`);
  return undefined;
};

export const registeredIntegrations = async <Extension>(replay: Replay, schema: z.ZodType<Extension> | undefined): Promise<RegisteredIntegration<Extension>[]> => {
  const rows = await everyRow(RegisteredRowSchema, (after) => replay('integrations/list', { after: after?.id ?? '' }));
  return rows.map((row) => ({ id: row.id, status: row.status, url: row.url, extension: storedExtension(row.id, row.extension, schema) }));
};

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

export const storedActionsOf = async (replay: Replay, id: string, upgrader?: Upgrader): Promise<Record<string, ActionDefinition>> =>
  actionsIn(await everyRow(StoredActionRowSchema, (after) => replay('integrations/actions-of', { id, ...afterAction(after) })), upgrader);

export const STORED_ACTIONS: DocumentStore = {
  table: 'integration_actions',
  column: 'definition',
  stamp: 'grammar',
  kind: 'nisc.nova/action',
  key: ['integration_id', 'action_id'],
};

// An action's id is ext.<audience>.<integration>.<name>.
export const integrationOfAction = (id: string): string | undefined =>
  id.startsWith('ext.') ? id.split('.')[2] : undefined;

export const filterInstalled = (ids: readonly string[], installed: ReadonlySet<string> | undefined): readonly string[] => {
  if (installed === undefined) return ids;
  return ids.filter((id) => {
    const owner = integrationOfAction(id);
    return owner === undefined || installed.has(owner);
  });
};
