import { StrataError, depthRefusal, exceedsDepth, type Upgrader } from '@niscorp/strata';
import type { ActionDefinition } from '@niscorp/nova';
import { isRecord } from '@niscorp/nova/reflect';
import type { FeatureSeams } from '../feature';
import { BundleSchema } from './bundle';
import type { AssistantDeclaration, Bundle, DocumentDeclaration } from './bundle';
import { FRAME_GRANT_URL } from './reach';

// ── the gate ──────────────────────────────────────────────────
//
// Everything here exists to make a mistake fail loudly at import, naming
// itself, instead of half-landing. Refusal is whole-payload: either the bundle
// is coherent and all of it lands, or none of it does and the rows from the
// last good import keep serving.

export type IntakeContext = {
  integrationId: string;
  // DOES A LAYOUT COMPOSE WHAT THE APP'S KIT HAS: the host's answer, each place
  // it does not as a sentence (the `layoutMisfits` seam). The component's name
  // is the floor — a layout naming one the terminal cannot render shows
  // nothing, and at the moment somebody opens it rather than the moment it
  // arrived. Where the app carried the schema of a component's props, a prop
  // the component has no place for is a misfit too. Asked of the host, which
  // knows its kit: this feature is not handed one to check against.
  layoutMisfits: FeatureSeams['layoutMisfits'];
  // THE CHAINS OF STEPS THAT NEVER END among a set of actions, each with the
  // actions it runs through: the host's answer (the `endlessChains` seam).
  endlessChains: FeatureSeams['endlessChains'];
  // Fingerprints the app serves. An action calling one that does not exist is a
  // typo now and a 404 in front of a customer later.
  fingerprints: ReadonlySet<string>;
  // Host actions that accept attachments (`attachable`, ./feature.ts). An
  // integration cannot ride a screen that never offered a seat.
  attachable: ReadonlySet<string>;
  // Menu hubs that accept placed screens (`menuSlots`, ./feature.ts). Who owns a
  // menu is the host's question; this set is its answer.
  menuSlots: ReadonlySet<string>;
  // Region actions the host's editor offers a document (`bar`, `outline`,
  // `stage`, `inspector` defaults), the host's closed assistant tool set, and
  // the publish checks the host runs. A document/assistant naming one the host
  // does not hold fails at intake, not in front of a person. Optional and
  // empty-by-default: a bundle declaring no documents/assistants needs none,
  // and a host that has not enumerated them yet fails those names closed.
  regions?: ReadonlySet<string>;
  tools?: ReadonlySet<string>;
  checks?: ReadonlySet<string>;
  // The host's grammars (../data, engine.ts). With it, a bundle's actions are
  // upgraded from the bundle's `grammar` stamp BEFORE they are parsed — an
  // action in an older grammar would fail today's strict schema otherwise.
  upgrader?: Upgrader;
  // The host's actions in force — a bundle's triggers can close a loop through
  // them (the host emits what the integration listens to, and back). Not part
  // of what the app shipped alone: the sets that arrived while it runs are
  // host actions too, so whoever runs the intake asks the running manifest.
  hostActions?: Readonly<Record<string, ActionDefinition>>;
};

// WHAT THE HOST OFFERS A BUNDLE TO NAME, AND WHAT IT ANSWERS ABOUT ONE: the
// two questions the server answers for any feature (whether a layout fits the
// kit, which chains of steps never end), and the seats, hubs, tools, checks
// and regions the app named when it created the feature (./feature.ts).
export type HostVocabulary = {
  layoutMisfits: FeatureSeams['layoutMisfits'];
  endlessChains: FeatureSeams['endlessChains'];
  attachable?: Readonly<Record<string, unknown>>;
  menuSlots?: readonly string[];
  assistantTools?: readonly string[];
  publishChecks?: readonly string[];
  editorRegions?: readonly string[];
};

// THE HOST'S VOCABULARY, gathered for one intake. The one place the
// registration route learns what this app offers a bundle to name —
// fingerprints, attachment seats, menu hubs, and the assistant tools /
// publish checks / editor regions a `documents`/`assistants` declaration is
// checked against — with the host's two answers about a layout and about
// chains of steps. Pure over the vocabulary plus the fingerprints the route
// reads from the engine, so it is testable without a running server. The actions in force are whoever runs the intake's to say
// (`hostActions` above).
export const intakeContextOf = (
  host: HostVocabulary,
  integrationId: string,
  fingerprints: ReadonlySet<string>,
  upgrader?: Upgrader,
): IntakeContext => ({
  integrationId,
  ...(upgrader === undefined ? {} : { upgrader }),
  layoutMisfits: host.layoutMisfits,
  endlessChains: host.endlessChains,
  fingerprints,
  attachable: new Set(Object.keys(host.attachable ?? {})),
  menuSlots: new Set(host.menuSlots ?? []),
  tools: new Set(host.assistantTools ?? []),
  checks: new Set(host.publishChecks ?? []),
  regions: new Set(host.editorRegions ?? []),
});

const AUDIENCE = /^[a-z][a-z0-9-]*$/;

export type IntakeResult = { ok: true; bundle: Bundle } | { ok: false; reasons: string[] };

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
// reasons it finds, in order. `runIntake` at the foot runs them in the order
// the reasons have always been said in.

// A layout, held to what the kit has (the host's answer), with each misfit
// said under the name of the thing the layout belongs to. Used for an action's
// layout and for section and block fragments alike: a fragment is a layout
// over `$.content` and earns the same refusal at the same moment.
const layoutReasons = (layout: unknown, label: string, ctx: IntakeContext): string[] => ctx.layoutMisfits(layout).map((misfit) => `${label}: ${misfit}`);

// ── it reaches two places and no others ──
const endpointReasons = (id: string, action: ActionDefinition, ctx: IntakeContext): string[] => {
  const reasons: string[] = [];
  for (const [name, endpoint] of Object.entries(action.endpoints ?? {})) {
    if ('fn' in endpoint) {
      // `fn:` runs IN the app's process, next to the session's shell. An
      // integration cannot ship code that runs here — that is the whole
      // point of it being a separate service.
      reasons.push(`action ${id}: endpoint "${name}" uses fn:, which runs in this app's process`);
      continue;
    }
    const url = endpoint.url;
    const own = `/integrations/${ctx.integrationId}/`;
    // The one HOST surface an action may name without a fingerprint: asking
    // for a frame grant. It reads nothing and writes nothing — it hands back
    // a URL the integration's own page is served at — so there is no fingerprint for
    // it to name, and the alternative is every integration inventing its own way to
    // reach a door that already exists.
    if (url === FRAME_GRANT_URL) continue;
    if (url.startsWith(own)) {
      // `/hook/` IS RESERVED. It is the one path on this server that requires
      // no principal (the webhook door) — a vendor calling in has
      // no session and could not have one. An action endpoint declared there
      // would be a screen's call riding the unauthenticated door, which is
      // how a door meant for one thing becomes a way around everything else.
      if (url.startsWith(`${own}hook/`)) {
        reasons.push(`action ${id}: endpoint "${name}" is under /hook/, which is the unauthenticated webhook path`);
      }
      // `/frame/` is where a grant is REDEEMED — a browser GET carrying a
      // token instead of a session. An action endpoint there would be a
      // screen's call spending a credential meant for a document.
      if (url.startsWith(`${own}frame/`)) {
        reasons.push(`action ${id}: endpoint "${name}" is under /frame/, which redeems frame grants`);
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

const actionReasons = (bundle: Bundle, ctx: IntakeContext): string[] => {
  const reasons: string[] = [];
  for (const [id, action] of Object.entries(bundle.actions)) {
    // ── the namespace ──
    //
    // `ext.<audience>.<integration>.<name>`. The charter grants the GLOB, once
    // per audience, so a new action needs no charter edit — and an integration
    // can only ever land inside a fence drawn before it existed.
    const parts = id.split('.');
    if (parts[0] !== 'ext' || parts.length < 4 || !AUDIENCE.test(parts[1] ?? '')) {
      reasons.push(`action ${id}: not namespaced ext.<audience>.<integration>.<name>`);
    } else if (parts[2] !== ctx.integrationId) {
      reasons.push(`action ${id}: claims the "${parts[2]}" namespace, which belongs to somebody else`);
    }

    if (action.id !== id) reasons.push(`action ${id}: its own id says "${action.id}"`);

    // ── the layout composes what the kit has, and sets props the kit knows ──
    //
    // A prop whose value is deferred (a binding or directive) has its KEY
    // checked and its value skipped.
    reasons.push(...layoutReasons(action.layout, `action ${id}`, ctx));
    reasons.push(...endpointReasons(id, action, ctx));
  }
  return reasons;
};

// ── no chain of steps that never ends ──
//
// A trigger that re-emits its own channel is valid data, and nova stops it
// at its budget when it runs — but a bundle is a stranger's code path into
// every principal's shell, so a loop is refused here rather than run. Walked
// with the host's actions, since a loop can close through the host's
// triggers; a loop the host has on its own is the host's to answer (boot
// names it) and does not refuse somebody else's bundle.
const chainReasons = (bundle: Bundle, ctx: IntakeContext): string[] =>
  ctx
    .endlessChains({ ...(ctx.hostActions ?? {}), ...bundle.actions })
    .filter((chain) => chain.through.some((actionId) => bundle.actions[actionId] !== undefined))
    .map((chain) => `a chain of steps that never ends: ${chain.path}`);

// ── the bindings point at things that exist, on both ends ────
const bindingReasons = (bundle: Bundle, ctx: IntakeContext): string[] => {
  const reasons: string[] = [];
  for (const [actionId, binding] of Object.entries(bundle.attachments)) {
    const host = typeof binding === 'string' ? binding : binding.to;
    const preview = typeof binding === 'string' ? '' : binding.preview;
    if (bundle.actions[actionId] === undefined) reasons.push(`attachment ${actionId}: no such action in this bundle`);
    if (!ctx.attachable.has(host)) reasons.push(`attachment ${actionId}: attaches to "${host}", which offers nothing`);
    if (preview !== '' && !preview.startsWith(`/integrations/${ctx.integrationId}/`)) {
      reasons.push(`attachment ${actionId}: preview "${preview}" is not under this integration's own prefix`);
    }
  }
  for (const [actionId, hub] of Object.entries(bundle.placements)) {
    if (bundle.actions[actionId] === undefined) reasons.push(`placement ${actionId}: no such action in this bundle`);
    if (!ctx.menuSlots.has(hub)) reasons.push(`placement ${actionId}: targets "${hub}", which accepts no integrations`);
  }
  // A FRAMED PAGE IS STILL THE INTEGRATION'S OWN GROUND. Same prefix rule as a
  // preview, and neither reserved door: `/hook/` needs no principal and
  // `/frame/` is where a grant is spent, so a page served at either would be
  // reachable by something other than the grant that was minted for it.
  const ownPrefix = `/integrations/${ctx.integrationId}/`;
  for (const [path, actionId] of Object.entries(bundle.frames)) {
    if (!path.startsWith(ownPrefix)) {
      reasons.push(`frame "${path}": not under this integration's own prefix`);
    } else if (path.startsWith(`${ownPrefix}hook/`) || path.startsWith(`${ownPrefix}frame/`)) {
      reasons.push(`frame "${path}": /hook/ and /frame/ are reserved`);
    }
    // The owner has to be real, or the grant check below it can never pass and
    // the page is simply unreachable — a refusal at intake beats a screen that
    // opens onto nothing.
    if (bundle.actions[actionId] === undefined) {
      reasons.push(`frame "${path}": belongs to "${actionId}", which is not an action in this bundle`);
    }
  }
  // PRESS IS FETCHED ONCE, AT INTAKE — it is never reach (reachOf sweeps
  // declarations; these are deliberately not among them) and the proxy never
  // forwards it. The paths still obey the same fences as every other
  // declaration: the integration's own ground, neither reserved door.
  for (const path of bundle.meta.press) {
    if (!path.startsWith(ownPrefix)) {
      reasons.push(`press "${path}": not under this integration's own prefix`);
    } else if (path.startsWith(`${ownPrefix}hook/`) || path.startsWith(`${ownPrefix}frame/`)) {
      reasons.push(`press "${path}": /hook/ and /frame/ are reserved`);
    }
  }
  // TWO CAPABILITIES WITH ONE ID compose to the same grant string, so the
  // host's role editor could never tell them apart — a bundle-coherence fault,
  // caught here beside the other cross-reference checks. Shape is the schema's;
  // uniqueness is the only thing about a capability moss can know is wrong.
  const seenCapability = new Set<string>();
  for (const capability of bundle.capabilities) {
    if (seenCapability.has(capability.id)) {
      reasons.push(`capability "${capability.id}": declared twice`);
    }
    seenCapability.add(capability.id);
  }
  if (bundle.settings !== '' && bundle.actions[bundle.settings] === undefined) {
    reasons.push(`settings: "${bundle.settings}" is not an action in this bundle`);
  }
  return reasons;
};

// One document's section types: none declared twice, each field's key once, a
// `pick` with something to pick from, no `list` (that is a block's), and a
// fragment that composes what the kit has.
const sectionTypeReasons = (doc: DocumentDeclaration, ctx: IntakeContext): string[] => {
  const reasons: string[] = [];
  const seenType = new Set<string>();
  for (const section of doc.registry) {
    if (seenType.has(section.type)) reasons.push(`document "${doc.id}": section type "${section.type}" declared twice`);
    seenType.add(section.type);
    const seenKey = new Set<string>();
    for (const field of section.fields) {
      if (seenKey.has(field.key)) reasons.push(`document "${doc.id}" section "${section.type}": field key "${field.key}" declared twice`);
      seenKey.add(field.key);
      if (field.kind === 'pick' && field.options.length < 2) {
        reasons.push(`document "${doc.id}" section "${section.type}": pick field "${field.key}" needs at least two options`);
      }
      if (field.kind === 'list') {
        reasons.push(`document "${doc.id}" section "${section.type}": a list field is only allowed inside an assistant block`);
      }
    }
    reasons.push(...layoutReasons(section.fragment, `document "${doc.id}" section "${section.type}" fragment`, ctx));
  }
  return reasons;
};

// ── WHAT AN ADD-ON LETS A PERSON EDIT ────────────────────────
//
// Cross-references the host holds or the bundle itself declares — the same
// posture as every check above. Shape is the schema's; these are the things
// only the surrounding bundle and the host can know are wrong.
const documentReasons = (bundle: Bundle, ctx: IntakeContext): string[] => {
  const reasons: string[] = [];
  const ownPrefix = `/integrations/${ctx.integrationId}/`;
  const ownActions = new Set(Object.keys(bundle.actions));
  const ownCapabilities = new Set(bundle.capabilities.map((c) => c.id));
  const hostRegions = ctx.regions ?? new Set<string>();
  const hostChecks = ctx.checks ?? new Set<string>();
  const seenDocument = new Set<string>();
  for (const doc of bundle.documents) {
    if (seenDocument.has(doc.id)) reasons.push(`document "${doc.id}": declared twice`);
    seenDocument.add(doc.id);
    if (!ownCapabilities.has(doc.capability)) {
      reasons.push(`document "${doc.id}": capability "${doc.capability}" is not one this bundle declares`);
    }
    if (!doc.publish.path.startsWith(ownPrefix)) {
      reasons.push(`document "${doc.id}": publish path "${doc.publish.path}" is not under this integration's own prefix`);
    }
    for (const [region, actionId] of Object.entries(doc.regions)) {
      if (actionId === undefined) continue;
      if (!ownActions.has(actionId) && !hostRegions.has(actionId)) {
        reasons.push(`document "${doc.id}": region "${region}" names "${actionId}", which is neither an action in this bundle nor a region the host offers`);
      }
    }
    for (const check of doc.checks) {
      if (!hostChecks.has(check)) reasons.push(`document "${doc.id}": check "${check}" is not one the host offers`);
    }
    reasons.push(...sectionTypeReasons(doc, ctx));
    if ('fixed' in doc.sections) {
      const registryTypes = new Set(doc.registry.map((s) => s.type));
      const siblingIds = new Set(doc.sections.fixed.map((f) => f.id));
      for (const f of doc.sections.fixed) {
        if (!registryTypes.has(f.type)) reasons.push(`document "${doc.id}": fixed section "${f.id}" has type "${f.type}", which is not in the registry`);
        if (f.extends !== undefined && !siblingIds.has(f.extends)) {
          reasons.push(`document "${doc.id}": fixed section "${f.id}" extends "${f.extends}", which is not a sibling`);
        }
      }
    }
  }
  return reasons;
};

// One assistant's block types: none declared twice, each field's key once, a
// `pick` with something to pick from, and a fragment that composes what the
// kit has. A `list` field IS allowed in a block — this is the one place it is.
const blockReasons = (assistant: AssistantDeclaration, ctx: IntakeContext): string[] => {
  const reasons: string[] = [];
  const seenBlock = new Set<string>();
  for (const block of assistant.blocks) {
    if (seenBlock.has(block.type)) reasons.push(`assistant "${assistant.id}": block type "${block.type}" declared twice`);
    seenBlock.add(block.type);
    const seenKey = new Set<string>();
    for (const field of block.fields) {
      if (seenKey.has(field.key)) reasons.push(`assistant "${assistant.id}" block "${block.type}": field key "${field.key}" declared twice`);
      seenKey.add(field.key);
      if (field.kind === 'pick' && field.options.length < 2) {
        reasons.push(`assistant "${assistant.id}" block "${block.type}": pick field "${field.key}" needs at least two options`);
      }
    }
    reasons.push(...layoutReasons(block.fragment, `assistant "${assistant.id}" block "${block.type}" fragment`, ctx));
  }
  return reasons;
};

// ── WHAT AN ADD-ON'S ASSISTANT KNOWS ─────────────────────────
const assistantReasons = (bundle: Bundle, ctx: IntakeContext): string[] => {
  const reasons: string[] = [];
  const ownActions = new Set(Object.keys(bundle.actions));
  const documentIds = new Set(bundle.documents.map((d) => d.id));
  const hostTools = ctx.tools ?? new Set<string>();
  const seenAssistant = new Set<string>();
  for (const assistant of bundle.assistants) {
    if (seenAssistant.has(assistant.id)) reasons.push(`assistant "${assistant.id}": declared twice`);
    seenAssistant.add(assistant.id);
    // It attaches to its OWN ground: a document of this bundle or a screen
    // (action) of this bundle, and it must attach to one of them.
    if (assistant.applies.document === undefined && assistant.applies.screen === undefined) {
      reasons.push(`assistant "${assistant.id}": applies to neither a document nor a screen`);
    }
    if (assistant.applies.document !== undefined && !documentIds.has(assistant.applies.document)) {
      reasons.push(`assistant "${assistant.id}": applies to document "${assistant.applies.document}", which this bundle does not declare`);
    }
    if (assistant.applies.screen !== undefined && !ownActions.has(assistant.applies.screen)) {
      reasons.push(`assistant "${assistant.id}": applies to screen "${assistant.applies.screen}", which is not an action in this bundle`);
    }
    for (const read of assistant.grounding) {
      if (!ctx.fingerprints.has(read.fingerprint)) {
        reasons.push(`assistant "${assistant.id}": grounding "${read.as}" reads "${read.fingerprint}", which this app does not serve`);
      }
    }
    for (const tool of assistant.tools) {
      if (!hostTools.has(tool)) reasons.push(`assistant "${assistant.id}": tool "${tool}" is not one the host offers`);
    }
    reasons.push(...blockReasons(assistant, ctx));
  }
  return reasons;
};

export const runIntake = (payload: unknown, ctx: IntakeContext): IntakeResult => {
  // Before anything reads it — the upgrader walks it and the schema recurses
  // on it, and either overflows the stack on a deep enough payload.
  if (exceedsDepth(payload)) return { ok: false, reasons: [depthRefusal()] };
  const upgraded = upgradeBundle(payload, ctx.upgrader);
  if (!upgraded.ok) return upgraded;
  const parsed = BundleSchema.safeParse(upgraded.payload);
  if (!parsed.success) {
    return { ok: false, reasons: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  const bundle = parsed.data;
  const reasons = [
    ...(bundle.integration === ctx.integrationId ? [] : [`bundle says it is "${bundle.integration}" but was fetched as "${ctx.integrationId}"`]),
    ...actionReasons(bundle, ctx),
    ...chainReasons(bundle, ctx),
    ...bindingReasons(bundle, ctx),
    ...documentReasons(bundle, ctx),
    ...assistantReasons(bundle, ctx),
  ];
  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, bundle };
};
