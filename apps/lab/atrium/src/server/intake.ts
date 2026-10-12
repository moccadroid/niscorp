import { z } from 'zod';
import { ActionDefinitionSchema } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import { QuerySchema, MutationDefinitionSchema, lintMutation } from '@niscorp/vex';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';

export type WireSlot = [string, string, string, string, string, string, string | null, string, string, string, number];
export type WireOption = [string, string, string, string, string, number, number];

const CANVASES = new Set(['home', 'work', 'aside']);
export type WireCapability = { id: string; version: number; enabled: boolean };

export type PulledBundle = {
  capabilities: WireCapability[];
  actions: Record<string, ActionDefinition>;
  queries: SeedEntry[];
  mutations: SeedMutation[];
  slots: WireSlot[];
  options: WireOption[];
  tables: string[];
};

const SlotRowSchema = z.tuple([z.string(), z.string(), z.string(), z.string(), z.string(), z.string(), z.string().nullable(), z.string(), z.string(), z.string(), z.number()]);
const OptionRowSchema = z.tuple([z.string(), z.string(), z.string(), z.string(), z.string(), z.number(), z.number()]);

const PayloadSchema = z
  .object({
    capabilities: z.array(
      z
        .object({
          id: z.string().min(1),
          version: z.number().int().positive(),
          enabled: z.boolean(),
        })
        .strict(),
    ),
    actions: z.record(z.string(), z.unknown()),
    queries: z.array(
      z.object({
        fingerprint: z.string().min(1),
        intent: z.string().optional(),
        shape: z.unknown().optional(),
        dsl: z.unknown(),
        mapping: z.unknown().optional(),
      }),
    ),
    mutations: z.array(
      z.object({
        fingerprint: z.string().min(1),
        intent: z.string().optional(),
        mutation: z.unknown(),
      }),
    ),
    slots: z.array(SlotRowSchema),
    options: z.array(OptionRowSchema),
    tables: z.array(z.string()),
  })
  .strict();

export type IntakeContext = {
  connectorId: string;
  coreFingerprints: ReadonlySet<string>;
  foreignFingerprints: ReadonlySet<string>;
  foreignActionIds: ReadonlySet<string>;
  foreignSlotIds: ReadonlySet<string>;
  capabilityVocabulary: ReadonlySet<string>;
  schemaTables: ReadonlySet<string>;
};

const AUDIENCES = new Set(['guest', 'desk', 'service', 'ops']);

const VEX_URL = /^\/api\/(?:[\w-]+\/)*vex$/;

const firstIssue = (error: z.ZodError): string => {
  const issue = error.issues[0];
  return issue === undefined ? 'invalid' : `${issue.path.join('.')}: ${issue.message}`;
};

export const intakeBundle = (raw: unknown, ctx: IntakeContext): { bundle: PulledBundle | null; errors: string[] } => {
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) return { bundle: null, errors: [`payload: ${firstIssue(parsed.error)}`] };
  const payload = parsed.data;
  const errors: string[] = [];

  const ownCapabilities = new Set<string>();
  for (const cap of payload.capabilities) {
    if (ownCapabilities.has(cap.id)) errors.push(`capability ${cap.id}: reported twice`);
    ownCapabilities.add(cap.id);
    if (!ctx.capabilityVocabulary.has(cap.id)) errors.push(`capability ${cap.id}: not in the app's vocabulary — vocabulary changes are reviewed in the app first`);
  }

  const ownFingerprints = new Set<string>();
  for (const { fingerprint } of [...payload.queries, ...payload.mutations]) {
    if (ownFingerprints.has(fingerprint)) errors.push(`fingerprint ${fingerprint}: shipped twice in one payload`);
    ownFingerprints.add(fingerprint);
    if (ctx.coreFingerprints.has(fingerprint)) errors.push(`fingerprint ${fingerprint}: collides with a core entry`);
    if (ctx.foreignFingerprints.has(fingerprint)) errors.push(`fingerprint ${fingerprint}: owned by another connector`);
  }

  const declaredTables = new Set(payload.tables);
  for (const table of payload.tables) {
    if (!ctx.schemaTables.has(table)) errors.push(`table ${table}: not in the schema`);
  }

  for (const query of payload.queries) {
    const dsl = QuerySchema.safeParse(query.dsl);
    if (!dsl.success) errors.push(`query ${query.fingerprint}: ${firstIssue(dsl.error)}`);
  }
  for (const mutation of payload.mutations) {
    const def = MutationDefinitionSchema.safeParse(mutation.mutation);
    if (!def.success) {
      errors.push(`mutation ${mutation.fingerprint}: ${firstIssue(def.error)}`);
      continue;
    }
    for (const issue of lintMutation(def.data)) errors.push(`mutation ${mutation.fingerprint}: ${issue}`);
    for (const op of Array.isArray(def.data) ? def.data : [def.data]) {
      if (!declaredTables.has(op.table)) errors.push(`mutation ${mutation.fingerprint}: writes ${op.table}, which the bundle does not declare in tables`);
    }
  }

  const actions: Record<string, ActionDefinition> = {};
  for (const [id, rawDef] of Object.entries(payload.actions)) {
    const def = ActionDefinitionSchema.safeParse(rawDef);
    if (!def.success) {
      errors.push(`action ${id}: ${firstIssue(def.error)}`);
      continue;
    }
    actions[id] = def.data as ActionDefinition;
    if (def.data.id !== id) errors.push(`action ${id}: definition says its id is ${def.data.id}`);

    const parts = id.split('.');
    if (parts[0] !== 'ext' || !AUDIENCES.has(parts[1] ?? '') || parts.length < 4) errors.push(`action ${id}: not namespaced ext.<audience>.<connector>.<name>`);
    if (ctx.foreignActionIds.has(id)) errors.push(`action ${id}: owned by another connector`);

    const properties = (def.data.input as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
    const dataKeys = new Set(Object.keys(def.data.data ?? {}));
    for (const key of Object.keys(properties)) {
      if (!dataKeys.has(key)) errors.push(`action ${id}: input declares ${key}, data lacks it`);
    }

    // Security: a bundle action reaches only the app's fingerprint replay (its own or
    // core fingerprints, named literally so this check can read them) and its own
    // connector's service through the proxy. No `fn`: that is in-process code.
    for (const [name, endpoint] of Object.entries(def.data.endpoints ?? {})) {
      const ep = endpoint as { fn?: string; url?: string; request?: { fingerprint?: unknown } };
      if (ep.fn !== undefined) {
        errors.push(`action ${id}: endpoint ${name} calls fn:${ep.fn} — bundles ship data, not in-process code`);
        continue;
      }
      const url = ep.url ?? '';
      if (VEX_URL.test(url)) {
        const fingerprint = ep.request?.fingerprint;
        if (typeof fingerprint !== 'string') errors.push(`action ${id}: endpoint ${name} replays a non-literal fingerprint`);
        else if (!ownFingerprints.has(fingerprint) && !ctx.coreFingerprints.has(fingerprint)) errors.push(`action ${id}: endpoint ${name} replays ${fingerprint}, which is neither this bundle's nor core`);
        continue;
      }
      if (url.startsWith(`/connectors/${ctx.connectorId}/`)) continue;
      errors.push(`action ${id}: endpoint ${name} reaches ${url === '' ? '(no url)' : url} — allowed: /api/*/vex or /connectors/${ctx.connectorId}/*`);
    }
  }

  const ownSlotIds = new Set<string>();
  const placed = new Set<string>();
  for (const slot of payload.slots) {
    const [audience, slotId, actionId, , , , capability, , , canvas] = slot;
    if (!CANVASES.has(canvas)) errors.push(`slot ${slotId}: canvas "${canvas}" is not one this shell has (${[...CANVASES].join(', ')})`);
    if (ownSlotIds.has(slotId)) errors.push(`slot ${slotId}: shipped twice in one payload`);
    ownSlotIds.add(slotId);
    if (ctx.foreignSlotIds.has(slotId)) errors.push(`slot ${slotId}: id owned by core or another connector`);
    if (!(actionId in payload.actions)) errors.push(`slot ${slotId}: places ${actionId}, which this bundle does not ship`);
    placed.add(actionId);
    if (actionId.split('.')[1] !== audience) errors.push(`slot ${slotId}: audience ${audience} but action ${actionId}`);
    if (capability === null) errors.push(`slot ${slotId}: no capability gate`);
    else if (!ownCapabilities.has(capability)) errors.push(`slot ${slotId}: gated on ${capability}, which this connector does not report`);
  }
  for (const id of Object.keys(payload.actions)) {
    if (!placed.has(id)) errors.push(`action ${id}: no slot places it — unreachable`);
  }

  const staffCaps = new Set(payload.slots.filter((s) => s[0] !== 'guest').map((s) => s[6]));
  for (const cap of new Set(payload.slots.filter((s) => s[0] === 'guest').map((s) => s[6]))) {
    if (cap !== null && !staffCaps.has(cap)) errors.push(`${cap}: guest half only — no staff surface in the bundle`);
  }

  payload.options.forEach((option, i) => {
    if (!ownCapabilities.has(option[0])) errors.push(`option ${i} (${option[1]}): capability ${option[0]} not in this connector's matrix`);
  });

  if (errors.length > 0) return { bundle: null, errors };
  return {
    bundle: {
      capabilities: payload.capabilities,
      actions,
      queries: payload.queries as SeedEntry[],
      mutations: payload.mutations as SeedMutation[],
      slots: payload.slots as WireSlot[],
      options: payload.options as WireOption[],
      tables: payload.tables,
    },
    errors: [],
  };
};
