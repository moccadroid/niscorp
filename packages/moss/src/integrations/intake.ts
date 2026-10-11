import type { z } from 'zod';
import { StrataError, depthRefusal, exceedsDepth, type Upgrader } from '@niscorp/strata';
import type { ActionDefinition } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';
import type { FeatureSeams } from '../feature';
import { BundleSchema } from './bundle';
import type { Bundle } from './bundle';

// ═══════════════════════════════════════════════════════════════
// INTAKE: the gate a bundle passes before any of it is kept.
//
// A mistake fails here, at import, naming itself. Refusal is whole: either the
// bundle is coherent and all of it lands, or none of it does and the rows of
// the last good import keep serving. Every reason is reported together, moss's
// own and the host app's.
// ═══════════════════════════════════════════════════════════════

// WHAT MOSS KNOWS OF A BUNDLE THAT THE APP'S OWN CHECK MAY NEED: which
// integration it is and where its service lives, the actions it ships (each
// already held to its namespace, its endpoints and the kit), the fingerprints
// the app serves, and the host's answer about a layout, for a layout the app's
// vocabulary lets a bundle carry.
export type ExtensionContext = {
  integration: string;
  url: string;
  actions: Readonly<Record<string, ActionDefinition>>;
  fingerprints: ReadonlySet<string>;
  layoutMisfits: (layout: unknown) => string[];
};

// THE HOST APP'S OWN VOCABULARY, as the app hands it to `createIntegrations`
// (./feature.ts). Moss reads nothing inside an extension: it asks these.
export type ExtensionConfig<Extension> = {
  // What a bundle's `extension` may be. It reads whatever the bundle carries
  // there, a bundle that carries nothing included: a schema that takes
  // `undefined` makes the extension optional. It also reads back what was
  // stored, so it takes what it answers.
  schema: z.ZodType<Extension>;
  // The reasons the app refuses an extension the schema read, each a sentence.
  // They are reported with moss's own, and any one refuses the bundle.
  check?: (extension: Extension, bundle: ExtensionContext) => string[];
  // Run once for an import that passed every check, before the row is written:
  // what it answers is what is stored. For what must not depend on the
  // vendor's service being reachable later (an image copied to the app's own
  // store). Throwing refuses the bundle whole. Not called for an extension
  // that reads as `undefined`.
  prepare?: (extension: Extension, bundle: ExtensionContext) => Extension | Promise<Extension>;
  // What the app tells vendors about its vocabulary: a plain value, served
  // with the contract as it is (./contract.ts).
  contract?: unknown;
};

export type IntakeContext<Extension = undefined> = {
  integrationId: string;
  // Where the integration's service lives: the address the bundle was fetched
  // from.
  url: string;
  // The app's own vocabulary. Absent: a bundle that carries an `extension` is
  // refused.
  extension?: ExtensionConfig<Extension>;
  // DOES A LAYOUT COMPOSE WHAT THE APP'S KIT HAS: the host's answer, each place
  // it does not as a sentence (the `layoutMisfits` seam). A layout naming a
  // component the terminal cannot render shows nothing, at the moment somebody
  // opens it; and where the app carried the schema of a component's props, a
  // prop the component has no place for is a misfit too.
  layoutMisfits: FeatureSeams['layoutMisfits'];
  // THE CHAINS OF STEPS THAT NEVER END among a set of actions, each with the
  // actions it runs through: the host's answer (the `endlessChains` seam).
  endlessChains: FeatureSeams['endlessChains'];
  // Fingerprints the app serves: what an endpoint that calls the app may name.
  fingerprints: ReadonlySet<string>;
  // The host's grammars. With it, a bundle's actions are upgraded from the
  // bundle's `grammar` stamp before they are parsed: an action in an older
  // grammar would not pass today's strict schema.
  upgrader?: Upgrader;
  // The host's actions in force: a bundle's triggers can close a loop through
  // them (the host emits what the integration listens to, and back). Whoever
  // runs the intake asks the running manifest, since the sets that arrived
  // while it runs are host actions too.
  hostActions?: Readonly<Record<string, ActionDefinition>>;
};

// What moss's own checks read of the context: all of it but the app's
// vocabulary.
type Checked = Omit<IntakeContext, 'extension'>;

const AUDIENCE = /^[a-z][a-z0-9-]*$/;

// A bundle that may land, with its extension as the app's schema read it
// (`undefined`: it carries none, and the app asks for none); or every reason it
// may not.
export type IntakeResult<Extension = undefined> = { ok: true; bundle: Bundle; extension: Extension | undefined } | { ok: false; reasons: string[] };

// A bundle's actions, brought to the host's grammar. Only the stamp and the
// actions are touched; everything else is parsed as it arrived.
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

// Each check below reads the bundle the schema already read and answers the
// reasons it finds, in order.

// ── an endpoint reaches two places and no others ──
const endpointReasons = (id: string, action: ActionDefinition, ctx: Checked): string[] => {
  const reasons: string[] = [];
  for (const [name, endpoint] of Object.entries(action.endpoints ?? {})) {
    if ('fn' in endpoint) {
      // `fn:` runs in the app's process, next to the session's shell. An
      // integration is a separate service, and ships no code that runs here.
      reasons.push(`action ${id}: endpoint "${name}" uses fn:, which runs in this app's process`);
      continue;
    }
    const url = endpoint.url;
    const own = `/integrations/${ctx.integrationId}/`;
    if (url.startsWith(own)) {
      // `/hook/` IS RESERVED. It is the one path on this server that requires
      // no principal (the webhook door): a vendor calling in has no session.
      // An action endpoint declared there would be a screen's call through the
      // unauthenticated door.
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
    // THE NAMESPACE: `ext.<audience>.<integration>.<name>`. The charter grants
    // the glob, once per audience, so a new action needs no charter edit, and
    // an integration lands only inside a fence the app drew.
    const parts = id.split('.');
    if (parts[0] !== 'ext' || parts.length < 4 || !AUDIENCE.test(parts[1] ?? '')) {
      reasons.push(`action ${id}: not namespaced ext.<audience>.<integration>.<name>`);
    } else if (parts[2] !== ctx.integrationId) {
      reasons.push(`action ${id}: claims the "${parts[2]}" namespace, which belongs to somebody else`);
    }

    if (action.id !== id) reasons.push(`action ${id}: its own id says "${action.id}"`);

    // The layout composes what the kit has, and sets props the kit knows. A
    // prop whose value is resolved when it is drawn (a binding or a directive)
    // has its key held and its value left alone.
    reasons.push(...ctx.layoutMisfits(action.layout).map((misfit) => `action ${id}: ${misfit}`));
    reasons.push(...endpointReasons(id, action, ctx));
  }
  return reasons;
};

// ── no chain of steps that never ends ──
//
// A trigger that re-emits its own channel is valid data, and nova stops it at
// its budget when it runs. A bundle is somebody else's path into every
// principal's shell, so a loop is refused here and not run. Walked with the
// host's actions, since a loop can close through the host's triggers; a loop
// the host has on its own is the host's to answer (boot names it) and does not
// refuse somebody else's bundle.
const chainReasons = (bundle: Bundle, ctx: Checked): string[] =>
  ctx
    .endlessChains({ ...(ctx.hostActions ?? {}), ...bundle.actions })
    .filter((chain) => chain.through.some((actionId) => bundle.actions[actionId] !== undefined))
    .map((chain) => `a chain of steps that never ends: ${chain.path}`);

// ── the host app's own vocabulary ────────────────────────────

export const extensionContextOf = (bundle: Bundle, ctx: Pick<IntakeContext, 'integrationId' | 'url' | 'fingerprints' | 'layoutMisfits'>): ExtensionContext => ({
  integration: ctx.integrationId,
  url: ctx.url,
  actions: bundle.actions,
  fingerprints: ctx.fingerprints,
  layoutMisfits: ctx.layoutMisfits,
});

// What the bundle carries under `extension`, read by the schema the app
// supplied and then held to the app's own check. An app that supplied no
// schema takes no extension.
const extensionOf = <Extension>(bundle: Bundle, ctx: IntakeContext<Extension>): { reasons: string[]; extension?: Extension } => {
  const config = ctx.extension;
  if (config === undefined) return { reasons: bundle.extension === undefined ? [] : ['extension: this app takes no extension, and the bundle carries one.'] };
  const read = config.schema.safeParse(bundle.extension);
  if (!read.success) return { reasons: read.error.issues.map((issue) => `${['extension', ...issue.path].join('.')}: ${issue.message}`) };
  return { reasons: config.check?.(read.data, extensionContextOf(bundle, ctx)) ?? [], extension: read.data };
};

// WHAT THE BUNDLE'S OWN SCHEMA REFUSED, each issue as a sentence. A top-level
// key that is not a field of a bundle is named, with where it belongs: the
// fields of a bundle are nisc's own, and what one app's vocabulary adds to
// them is that app's to read.
const schemaReasons = (error: z.ZodError): string[] =>
  error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys' && issue.path.length === 0
      ? issue.keys.map((key) => `"${key}" is not a field of a bundle. What belongs to the host app’s own vocabulary goes under \`extension\`.`)
      : [`${issue.path.join('.') || '(root)'}: ${issue.message}`],
  );

export const runIntake = <Extension = undefined>(payload: unknown, ctx: IntakeContext<Extension>): IntakeResult<Extension> => {
  // Before anything reads it: the upgrader walks it and the schema recurses on
  // it, and either overflows the stack on a deep enough payload.
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
