import { resolvePrincipal, verifyCharter } from '@niscorp/charter';
import type { Charter, ClosureAuditor, VerifyReport } from '@niscorp/charter';
import { ActionDefinitionSchema, auditAction, collectChannels } from '@niscorp/nova';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { chainCycles, isRecord, walkNodes } from '@niscorp/nova/reflect';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import { scopeProfiles } from '@niscorp/vex';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { z } from 'zod';
import { isBinding } from '@niscorp/nova/i18n';
import { entriesOf, wearableOf } from './app';
import type { LayoutVariant, NiscApp } from './app';

export type ManifestCandidate = {
  charter: Charter;
  actions: Readonly<Record<string, ActionDefinition>>;
  layouts: Readonly<Record<string, LayoutVariant>>;
  wearable: readonly (readonly string[])[];
  grants: readonly string[];
  entries: readonly (SeedEntry | SeedMutation)[];
  profiles: ReadonlySet<string>;
};

export type ShippedManifest = Pick<NiscApp, 'charter' | 'actions' | 'layouts' | 'wearable' | 'assignments' | 'entries' | 'behaviors'>;

export const candidateOf = (shipped: ShippedManifest, inForce: Pick<ManifestCandidate, 'actions' | 'entries'>, grants: readonly string[]): ManifestCandidate => ({
  charter: shipped.charter,
  actions: inForce.actions,
  layouts: shipped.layouts ?? {},
  wearable: wearableOf(shipped),
  grants,
  entries: inForce.entries,
  profiles: scopeProfiles(shipped.behaviors ?? {}),
});

export type ManifestCheck = 'actions' | 'charter' | 'reach' | 'variants';

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

const reachErrors = (entries: ManifestCandidate['entries'], profiles: ReadonlySet<string>): string[] => {
  const unknown = entries.flatMap((entry) => (entry.reach !== undefined && !profiles.has(entry.reach) ? [`${entry.fingerprint} declares reach "${entry.reach}"`] : []));
  return unknown.length === 0 ? [] : [...unknown, `known profiles: ${[...profiles].join(', ') || '(none)'}`];
};

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
      ...found('charter', charter.errors.map((error) => `${error.rule}: ${error.detail}`)),
      ...found('reach', reachErrors(read.entries, read.profiles)),
      ...found('variants', verifyVariants(read)),
    ],
    said: endlessChains(read.actions).map((chain) => `a chain of steps that never ends: ${chain.path} — nova stops it at its budget when it runs (RUNAWAY_CHAIN)`),
    charter,
  };
};

export const verifyApp = (app: ShippedManifest, grants: readonly string[]): ManifestReport =>
  verifyManifest(candidateOf(app, { actions: app.actions, entries: entriesOf(app) }, grants));

const HEADLINES = {
  boot: {
    actions: 'Actions are not ones nova reads — refusing to serve:',
    charter: 'Charter is incoherent — refusing to serve:',
    reach: 'Entries declare a reach no table offers — refusing to serve:',
    variants: 'Layout variants are incoherent — refusing to serve:',
  },
  refresh: {
    actions: 'Refresh refused — actions nova does not read:',
    charter: 'Refresh refused — charter incoherent over the new artifacts:',
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
