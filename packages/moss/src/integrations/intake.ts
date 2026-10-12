import { z } from 'zod';
import { ActionDefinitionSchema } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import { StrataError, depthRefusal, exceedsDepth, type Upgrader } from '@niscorp/strata';
import { isRecord } from '@niscorp/nova/reflect';
import type { FeatureSeams } from '../feature';

export const INTEGRATION_ID = /^[a-z][a-z0-9-]*$/;
export const INTEGRATION_ID_RULE = 'An integration id is lower-case letters, digits and hyphens, and starts with a letter.';

export const BundleSchema = z
  .object({
    integration: z.string().regex(INTEGRATION_ID, INTEGRATION_ID_RULE),
    grants: z
      .object({
        actions: z.array(z.string()).default([]),
        data: z.array(z.string()).default([]),
      })
      .default({ actions: [], data: [] }),
    grammar: z.record(z.string(), z.number().int().nonnegative()).optional(),
    actions: z.record(z.string(), ActionDefinitionSchema),
    phrasebook: z.record(z.string().regex(/^[a-z]{2}$/, 'a phrasebook is keyed by LANGUAGE (`de`), never by locale (`de-AT`)'), z.record(z.string(), z.string())).default({}),
    extension: z.unknown().optional(),
  })
  .strict();

export type Bundle = z.infer<typeof BundleSchema>;

export type ExtensionContext = {
  integration: string;
  url: string;
  actions: Readonly<Record<string, ActionDefinition>>;
  fingerprints: ReadonlySet<string>;
  layoutMisfits: (layout: unknown) => string[];
};

export type ExtensionConfig<Extension> = {
  schema: z.ZodType<Extension>;
  check?: (extension: Extension, bundle: ExtensionContext) => string[];
  prepare?: (extension: Extension, bundle: ExtensionContext) => Extension | Promise<Extension>;
  contract?: unknown;
};

export type IntakeContext<Extension = undefined> = {
  integrationId: string;
  url: string;
  extension?: ExtensionConfig<Extension>;
  layoutMisfits: FeatureSeams['layoutMisfits'];
  endlessChains: FeatureSeams['endlessChains'];
  fingerprints: ReadonlySet<string>;
  upgrader?: Upgrader;
  hostActions?: Readonly<Record<string, ActionDefinition>>;
};

type Checked = Omit<IntakeContext, 'extension'>;

const AUDIENCE = /^[a-z][a-z0-9-]*$/;

export type IntakeResult<Extension = undefined> = { ok: true; bundle: Bundle; extension: Extension | undefined } | { ok: false; reasons: string[] };

const upgradeBundle = (payload: unknown, upgrader: Upgrader | undefined): { ok: true; payload: unknown } | { ok: false; reasons: string[] } => {
  if (upgrader === undefined || !isRecord(payload) || !isRecord(payload['actions'])) return { ok: true, payload };
  const declared = payload['grammar'];
  const stamp = isRecord(declared) ? Object.fromEntries(Object.entries(declared).map(([k, v]) => [k, Number(v)])) : {};
  try {
    const actions = Object.fromEntries(
      Object.entries(payload['actions']).map(([id, definition]) => [id, upgrader.upgrade(definition, { kind: 'nisc.nova/action', stamp }).document]),
    );
    return { ok: true, payload: { ...payload, actions, grammar: upgrader.stamp } };
  } catch (error) {
    if (!(error instanceof StrataError)) throw error;
    return {
      ok: false,
      reasons:
        error.code === 'TOO_NEW'
          ? ['This integration was built on newer nisc grammars than this host runs — the host must be updated first.', ...error.details]
          : [error.message.split('\n')[0] ?? error.code, ...error.details],
    };
  }
};

const endpointReasons = (id: string, action: ActionDefinition, ctx: Checked): string[] => {
  const reasons: string[] = [];
  for (const [name, endpoint] of Object.entries(action.endpoints ?? {})) {
    if ('fn' in endpoint) {
      reasons.push(`action ${id}: endpoint "${name}" uses fn:, which runs in this app's process`);
      continue;
    }
    const url = endpoint.url;
    const own = `/integrations/${ctx.integrationId}/`;
    if (url.startsWith(own)) {
      if (url.startsWith(`${own}hook/`)) {
        reasons.push(`action ${id}: endpoint "${name}" is under /hook/, which is the unauthenticated webhook path`);
      }
      continue;
    }
    if (!url.startsWith('/api/')) {
      reasons.push(`action ${id}: endpoint "${name}" calls "${url}" — only ${own}* or /api/*/vex`);
      continue;
    }
    const fingerprint = isRecord(endpoint.request) ? endpoint.request['fingerprint'] : undefined;
    if (typeof fingerprint !== 'string') {
      reasons.push(`action ${id}: endpoint "${name}" calls the app without naming a fingerprint`);
    } else if (!ctx.fingerprints.has(fingerprint)) {
      reasons.push(`action ${id}: endpoint "${name}" calls "${fingerprint}", which this app does not serve`);
    }
  }
  return reasons;
};

const actionReasons = (bundle: Bundle, ctx: Checked): string[] => {
  const reasons: string[] = [];
  for (const [id, action] of Object.entries(bundle.actions)) {
    const parts = id.split('.');
    if (parts[0] !== 'ext' || parts.length < 4 || !AUDIENCE.test(parts[1] ?? '')) {
      reasons.push(`action ${id}: not namespaced ext.<audience>.<integration>.<name>`);
    } else if (parts[2] !== ctx.integrationId) {
      reasons.push(`action ${id}: claims the "${parts[2]}" namespace, which belongs to somebody else`);
    }

    if (action.id !== id) reasons.push(`action ${id}: its own id says "${action.id}"`);

    reasons.push(...ctx.layoutMisfits(action.layout).map((misfit) => `action ${id}: ${misfit}`));
    reasons.push(...endpointReasons(id, action, ctx));
  }
  return reasons;
};

const chainReasons = (bundle: Bundle, ctx: Checked): string[] =>
  ctx
    .endlessChains({ ...(ctx.hostActions ?? {}), ...bundle.actions })
    .filter((chain) => chain.through.some((actionId) => bundle.actions[actionId] !== undefined))
    .map((chain) => `a chain of steps that never ends: ${chain.path}`);

export const extensionContextOf = (bundle: Bundle, ctx: Pick<IntakeContext, 'integrationId' | 'url' | 'fingerprints' | 'layoutMisfits'>): ExtensionContext => ({
  integration: ctx.integrationId,
  url: ctx.url,
  actions: bundle.actions,
  fingerprints: ctx.fingerprints,
  layoutMisfits: ctx.layoutMisfits,
});

const extensionOf = <Extension>(bundle: Bundle, ctx: IntakeContext<Extension>): { reasons: string[]; extension?: Extension } => {
  const config = ctx.extension;
  if (config === undefined) return { reasons: bundle.extension === undefined ? [] : ['extension: this app takes no extension, and the bundle carries one.'] };
  const read = config.schema.safeParse(bundle.extension);
  if (!read.success) return { reasons: read.error.issues.map((issue) => `${['extension', ...issue.path].join('.')}: ${issue.message}`) };
  return { reasons: config.check?.(read.data, extensionContextOf(bundle, ctx)) ?? [], extension: read.data };
};

const schemaReasons = (error: z.ZodError): string[] =>
  error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys' && issue.path.length === 0
      ? issue.keys.map((key) => `"${key}" is not a field of a bundle. What belongs to the host app’s own vocabulary goes under \`extension\`.`)
      : [`${issue.path.join('.') || '(root)'}: ${issue.message}`],
  );

export const runIntake = <Extension = undefined>(payload: unknown, ctx: IntakeContext<Extension>): IntakeResult<Extension> => {
  // First: the upgrader and the schema both recurse, and a deep enough payload overflows the stack.
  if (exceedsDepth(payload)) return { ok: false, reasons: [depthRefusal()] };
  const upgraded = upgradeBundle(payload, ctx.upgrader);
  if (!upgraded.ok) return upgraded;
  const parsed = BundleSchema.safeParse(upgraded.payload);
  if (!parsed.success) return { ok: false, reasons: schemaReasons(parsed.error) };
  const bundle = parsed.data;
  const extension = extensionOf(bundle, ctx);
  const reasons = [
    ...(bundle.integration === ctx.integrationId ? [] : [`bundle says it is "${bundle.integration}" but was fetched as "${ctx.integrationId}"`]),
    ...actionReasons(bundle, ctx),
    ...chainReasons(bundle, ctx),
    ...extension.reasons,
  ];
  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, bundle, extension: extension.extension };
};
