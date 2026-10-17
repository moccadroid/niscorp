import { normalizeRole, resolvePrincipal, verifyCharter } from '@niscorp/charter';
import type { Charter, ClosureAuditor, VerifyReport } from '@niscorp/charter';
import { ActionDefinitionSchema, auditAction, collectChannels } from '@niscorp/nova';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { chainCycles, isRecord, walkNodes } from '@niscorp/nova/reflect';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import { scopeProfiles } from '@niscorp/vex';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { z } from 'zod';
import { isBinding } from '@niscorp/nova/i18n';
import { GENERATED_ID_PREFIX, entriesOf, keptLayoutNameRefusal, wearableOf } from './app';
import type { LayoutVariant, NiscApp } from './app';

export type ManifestCandidate = {
  charter: Charter;
  actions: Readonly<Record<string, ActionDefinition>>;
  layouts: Readonly<Record<string, LayoutVariant>>;
  fragmentIds: ReadonlySet<string>;
  // The functions each fragment the shells ship calls: two shells may ship one under one id.
  fragmentCalls: readonly { id: string; calls: readonly string[] }[];
  // The app's functions, once a shell has been built and they are known.
  functionIds?: ReadonlySet<string>;
  wearable: readonly (readonly string[])[];
  grants: readonly string[];
  entries: readonly (SeedEntry | SeedMutation)[];
  profiles: ReadonlySet<string>;
};

export type ShippedManifest = Pick<NiscApp, 'charter' | 'actions' | 'layouts' | 'wearable' | 'assignments' | 'entries' | 'behaviors' | 'shell' | 'pages'>;

export const candidateOf = (shipped: ShippedManifest, inForce: Pick<ManifestCandidate, 'actions' | 'entries'>, grants: readonly string[]): ManifestCandidate => ({
  charter: shipped.charter,
  actions: inForce.actions,
  layouts: shipped.layouts ?? {},
  fragmentIds: new Set([shipped.shell, ...Object.values(shipped.pages ?? {})].flatMap((shell) => Object.keys(shell?.fragments ?? {}))),
  fragmentCalls: [shipped.shell, ...Object.values(shipped.pages ?? {})].flatMap((shell) =>
    Object.entries(shell?.fragments ?? {}).map(([id, fragment]) => ({ id, calls: functionsCalledBy(fragment) })),
  ),
  wearable: wearableOf(shipped),
  grants,
  entries: inForce.entries,
  profiles: scopeProfiles(shipped.behaviors ?? {}),
});

export type ManifestCheck = 'actions' | 'charter' | 'functions' | 'reach' | 'variants';

export type ManifestReport = {
  errors: readonly { check: ManifestCheck; detail: string }[];
  said: readonly string[];
  charter: VerifyReport;
};

const unreadActions = (actions: ManifestCandidate['actions']): { id: string; why: string }[] =>
  Object.entries(actions).flatMap(([id, definition]) => {
    if (exceedsDepth(definition)) return [{ id, why: depthRefusal() }];
    const parsed = ActionDefinitionSchema.safeParse(definition);
    if (parsed.success) return [];
    const first = parsed.error.issues[0];
    return [{ id, why: first === undefined ? 'no reason given' : `${first.path.join('.') || '(root)'}: ${first.message}` }];
  });

// A node that is `{ ref }` and nothing else names a layout. What a component keeps in its props is its own, a `ref` there too.
const layoutsNamedIn = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(layoutsNamedIn);
  if (!isRecord(node)) return [];
  const ref = node['ref'];
  if (typeof ref === 'string' && Object.keys(node).length === 1) return [ref];
  return Object.entries(node).flatMap(([key, inner]) => (key === 'props' ? [] : layoutsNamedIn(inner)));
};

// Two layouts moss keeps that could name each other would be drawn inside each other without end: neither names one.
const keptLayoutNamedIn = (layout: unknown): string | undefined =>
  (typeof layout === 'string' ? [layout] : layoutsNamedIn(layout)).find((name) => keptLayoutNameRefusal(name) !== undefined);

export const layoutNameRefusal = (layout: unknown): string | undefined => {
  const named = keptLayoutNamedIn(layout);
  return named === undefined ? undefined : `names the layout "${named}": ${keptLayoutNameRefusal(named)}`;
};

const layoutNameErrors = (actions: ManifestCandidate['actions']): string[] =>
  Object.entries(actions).flatMap(([id, definition]) => {
    const refusal = layoutNameRefusal(definition.layout);
    return refusal === undefined ? [] : [`"${id}" ${refusal}`];
  });

// The id a definition carries is held to it as the one it is listed under is: a shell registers an action under the first.
const generatedIdErrors = (actions: ManifestCandidate['actions']): string[] =>
  Object.entries(actions).flatMap(([listed, definition]) => {
    const taken = [listed, definition.id].find((id) => id.startsWith(GENERATED_ID_PREFIX));
    return taken === undefined ? [] : [`"${taken}" begins with "${GENERATED_ID_PREFIX}", which is where what somebody generated is kept`];
  });

// Nova keeps actions and fragments in one registry: a shell built with both under one id is refused there.
const fragmentIdErrors = (actions: ManifestCandidate['actions'], fragmentIds: ManifestCandidate['fragmentIds']): string[] =>
  Object.entries(actions).flatMap(([listed, definition]) => {
    const taken = [listed, definition.id].find((id) => fragmentIds.has(id));
    return taken === undefined ? [] : [`"${taken}" is the id of an action and of a fragment a shell ships: an id names one of the two`];
  });

const reachErrors = (entries: ManifestCandidate['entries'], profiles: ReadonlySet<string>): string[] => {
  const unknown = entries.flatMap((entry) => (entry.reach !== undefined && !profiles.has(entry.reach) ? [`${entry.fingerprint} declares reach "${entry.reach}"`] : []));
  return unknown.length === 0 ? [] : [...unknown, `known profiles: ${[...profiles].join(', ') || '(none)'}`];
};

// A name with a template in it is worked out when it is called, from the action's data.
const functionsCalledBy = (definition: Pick<ActionDefinition, 'endpoints'>): string[] =>
  Object.values(definition.endpoints ?? {}).flatMap((endpoint) => ('fn' in endpoint && !endpoint.fn.includes('{{') ? [endpoint.fn] : []));

// Who may wear what, as the variant check reads it: each role on its own, each
// combination the app declares, and `public`.
const combinationsOf = (candidate: Pick<ManifestCandidate, 'charter' | 'wearable'>): readonly (readonly string[])[] => {
  const combinations = new Map<string, readonly string[]>();
  for (const roles of [...Object.keys(candidate.charter).map((role) => [role]), ...candidate.wearable, ['public']]) combinations.set([...roles].sort().join('\0'), roles);
  return [...combinations.values()];
};

// A function an action calls is one its holder's roles grant, or the call fails when it is made.
const functionGrantErrors = (candidate: Pick<ManifestCandidate, 'charter' | 'actions' | 'fragmentCalls' | 'wearable'>): string[] => {
  const errors = new Set<string>();
  for (const roles of combinationsOf(candidate)) {
    let held: ReadonlySet<string>;
    try {
      held = resolvePrincipal(candidate.charter, Object.keys(candidate.actions), roles, 'actions');
    } catch {
      continue;
    }
    if (held.size === 0) continue;
    const calls = [
      ...[...held].flatMap((id) => functionsCalledBy(candidate.actions[id] ?? {}).map((fn) => ({ by: `"${id}"`, fn }))),
      ...candidate.fragmentCalls.flatMap(({ id, calls: fns }) => fns.map((fn) => ({ by: `the fragment "${id}", which any of them may wear`, fn }))),
    ];
    const granted = resolvePrincipal(candidate.charter, calls.map((call) => call.fn), roles, 'functions');
    const who = roles.map((role) => `"${role}"`).join(', ');
    for (const call of calls) {
      if (!granted.has(call.fn)) errors.add(`${who} hold ${call.by}, which calls "${call.fn}": their functions do not grant it`);
    }
  }
  return [...errors];
};

const unknownFunctionErrors = (candidate: Pick<ManifestCandidate, 'actions' | 'fragmentCalls' | 'functionIds'>): string[] => {
  const known = candidate.functionIds;
  if (known === undefined) return [];
  return [
    ...Object.entries(candidate.actions).flatMap(([id, definition]) => functionsCalledBy(definition).map((fn) => ({ by: `"${id}"`, fn }))),
    ...candidate.fragmentCalls.flatMap(({ id, calls }) => calls.map((fn) => ({ by: `the fragment "${id}"`, fn }))),
  ].flatMap(({ by, fn }) => (known.has(fn) ? [] : [`${by} calls "${fn}", which the app has no function of`]));
};

const everyFunctionGranted = (charter: Charter): string[] =>
  Object.entries(charter).flatMap(([role, def]) =>
    normalizeRole(def, 'functions').allow.includes('*')
      ? [`role "${role}" allows every function ('*'): the generated actions of the people who hold it, or a role that extends it, may call any it does not deny`]
      : [],
  );

export type EndlessChain = { path: string; through: readonly string[] };

export const endlessChains = (actions: Readonly<Record<string, ActionDefinition>>): EndlessChain[] =>
  chainCycles(actions).map((cycle) => ({ path: cycle.path, through: cycle.steps.map((step) => step.action) }));

export const verifyManifest = (candidate: ManifestCandidate): ManifestReport => {
  const unread = unreadActions(candidate.actions);
  const refused = new Set(unread.map((action) => action.id));
  // The checks below walk the definitions, and one no schema has read can
  // throw out of a walk, so they run over the ones that were read.
  const read: ManifestCandidate =
    refused.size === 0 ? candidate : { ...candidate, actions: Object.fromEntries(Object.entries(candidate.actions).filter(([id]) => !refused.has(id))) };
  const charter = verifyCharter(
    read.charter,
    { actions: Object.keys(read.actions), data: read.grants, layouts: Object.keys(read.layouts) },
    read.wearable,
    auditClosure(read.actions, read.layouts),
  );
  const found = (check: ManifestCheck, details: readonly string[]): ManifestReport['errors'] => details.map((detail) => ({ check, detail }));
  return {
    errors: [
      ...found('actions', unread.map((action) => `"${action.id}" is not an action nova reads: ${action.why}`)),
      ...found('actions', layoutNameErrors(read.actions)),
      ...found('actions', generatedIdErrors(read.actions)),
      ...found('actions', fragmentIdErrors(read.actions, read.fragmentIds)),
      ...found('charter', charter.errors.map((error) => `${error.rule}: ${error.detail}`)),
      ...found('functions', [...unknownFunctionErrors(read), ...functionGrantErrors(read)]),
      ...found('reach', reachErrors(read.entries, read.profiles)),
      ...found('variants', verifyVariants(read)),
    ],
    said: [
      ...endlessChains(read.actions).map((chain) => `a chain of steps that never ends: ${chain.path} — nova stops it at its budget when it runs (RUNAWAY_CHAIN)`),
      ...everyFunctionGranted(read.charter),
    ],
    charter,
  };
};

export const verifyApp = (app: ShippedManifest, grants: readonly string[]): ManifestReport =>
  verifyManifest(candidateOf(app, { actions: app.actions, entries: entriesOf(app) }, grants));

const HEADLINES = {
  boot: {
    actions: 'Actions are not ones nova reads — refusing to serve:',
    charter: 'Charter is incoherent — refusing to serve:',
    functions: 'Actions call functions the app does not have, or that their holders’ charter does not grant — refusing to serve:',
    reach: 'Entries declare a reach no table offers — refusing to serve:',
    variants: 'Layout variants are incoherent — refusing to serve:',
  },
  refresh: {
    actions: 'Refresh refused — actions nova does not read:',
    charter: 'Refresh refused — charter incoherent over the new artifacts:',
    functions: 'Refresh refused — actions call functions the app does not have, or that their holders’ charter does not grant:',
    reach: 'Refresh refused — entries declare a reach no table offers:',
    variants: 'Refresh refused — layout variants incoherent:',
  },
} as const;

export const refusalOf = (report: ManifestReport, moment: keyof typeof HEADLINES): string | undefined => {
  const first = report.errors[0];
  if (first === undefined) return undefined;
  const findings = report.errors.filter((error) => error.check === first.check).map((error) => `  ${error.detail}`);
  return [HEADLINES[moment][first.check], ...findings].join('\n');
};

export const verifyVariants = (app: Pick<NiscApp, 'charter' | 'actions' | 'layouts' | 'wearable' | 'assignments'>): string[] => {
  const variants = app.layouts ?? {};
  const ids = Object.keys(variants);
  if (ids.length === 0) return [];
  const errors: string[] = [];
  for (const [id, variant] of Object.entries(variants)) {
    if (app.actions[variant.action] === undefined) {
      errors.push(`layout variant "${id}" reshapes unknown action "${variant.action}"`);
    }
    const refusal = layoutNameRefusal(variant.layout);
    if (refusal !== undefined) errors.push(`layout variant "${id}" ${refusal}`);
  }
  const wearers = new Map<string, readonly string[]>();
  for (const role of Object.keys(app.charter)) wearers.set(`role "${role}"`, [role]);
  for (const roles of wearableOf(app)) wearers.set(`the combination [${[...roles].join(', ')}]`, roles);
  wearers.set('the anonymous principal', ['public']);
  for (const [who, roles] of wearers) {
    let granted: ReadonlySet<string>;
    try {
      granted = resolvePrincipal(app.charter, ids, roles, 'layouts');
    } catch {
      // An unknown or cyclic role is the charter verifier's finding.
      continue;
    }
    const byAction = new Map<string, string[]>();
    for (const id of granted) {
      const variant = variants[id];
      if (variant !== undefined) byAction.set(variant.action, [...(byAction.get(variant.action) ?? []), id]);
    }
    for (const [action, held] of byAction) {
      if (held.length > 1) {
        errors.push(`${who} holds ${held.length} variants of "${action}" (${held.sort().join(', ')}) — one variant per action per principal`);
      }
    }
  }
  return errors;
};

export const variantLayouts = (variants: Readonly<Record<string, LayoutVariant>>, held: Iterable<string>): ReadonlyMap<string, LayoutNode> => {
  const layouts = new Map<string, LayoutNode>();
  for (const id of held) {
    const variant = variants[id];
    if (variant !== undefined) layouts.set(variant.action, variant.layout);
  }
  return layouts;
};

export const withVariants = (
  actions: Readonly<Record<string, ActionDefinition>>,
  ids: readonly string[],
  layouts: ReadonlyMap<string, LayoutNode>,
): [string, ActionDefinition][] =>
  ids.flatMap((id): [string, ActionDefinition][] => {
    const definition = actions[id];
    if (definition === undefined) return [];
    const layout = layouts.get(id);
    return [[id, layout === undefined ? definition : { ...definition, layout }]];
  });

export const auditClosure = (definitions: Record<string, ActionDefinition>, variants: Record<string, LayoutVariant> = {}): ClosureAuditor => {
  return (grantedIds, layoutIds = []) => {
    const granted = withVariants(definitions, grantedIds, variantLayouts(variants, layoutIds)).map(([, definition]) => definition);
    const catalog = granted.map((definition) => ({ id: definition.id, input: definition.input ?? {} }));
    const channels = [
      ...new Set(
        granted.flatMap((definition) => {
          const found = collectChannels(definition);
          return [...found.emits, ...found.listens];
        }),
      ),
    ];
    const issues: string[] = [];
    for (const definition of granted) {
      const audit = auditAction(definition, { catalog, channels });
      if (audit.ok) continue;
      for (const issue of audit.issues) {
        // Only a push target outside the granted set is a closure break, and
        // a template target is resolved at run time, so it is not one.
        if (issue.includes('which is not in the catalog') && !issue.includes('{{')) issues.push(`${definition.id}: ${issue}`);
      }
    }
    return issues;
  };
};

export type KitComponents = ReadonlyMap<string, { propsSchema?: unknown }>;

// A binding string or a directive object resolves at render time, so its type
// cannot be checked here. Top level only: one nested in a static value is not unwound.
const isDeferred = (value: unknown): boolean =>
  (typeof value === 'string' && isBinding(value)) || (isRecord(value) && Object.keys(value).some((key) => key.startsWith('$')));

export const layoutMisfits = (layout: unknown, components: KitComponents): string[] => {
  const found = new Set<string>();
  walkNodes(layout, (record) => {
    const name = record['component'];
    if (typeof name !== 'string') return;
    const spec = components.get(name);
    if (spec === undefined) {
      found.add(`layout uses "${name}", which this app has no component for`);
      return;
    }
    const schema = spec.propsSchema;
    const props = record['props'];
    if (!(schema instanceof z.ZodObject) || !isRecord(props)) return;
    const shape: Readonly<Record<string, z.core.$ZodType>> = schema.shape;
    for (const [key, value] of Object.entries(props)) {
      const prop = shape[key];
      if (prop === undefined) {
        found.add(`"${name}" has no prop "${key}"`);
        continue;
      }
      if (isDeferred(value)) continue;
      const check = z.safeParse(prop, value);
      if (!check.success) found.add(`"${name}" prop "${key}" — ${check.error.issues[0]?.message ?? 'invalid'}`);
    }
  });
  return [...found];
};
