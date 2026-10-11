import { resolvePrincipal, verifyCharter } from '@niscorp/charter';
import type { Charter, ClosureAuditor, VerifyReport } from '@niscorp/charter';
import { ActionDefinitionSchema, auditAction, collectChannels } from '@niscorp/nova';
import type { ActionDefinition } from '@niscorp/nova';
import { chainCycles, isRecord, walkNodes } from '@niscorp/nova/reflect';
import { depthRefusal, exceedsDepth } from '@niscorp/strata';
import { scopeProfiles } from '@niscorp/vex';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { z } from 'zod';
import { isBinding } from '@niscorp/nova/i18n';
import type { LayoutVariant, NiscApp } from './app';
import { entriesOf } from './artifacts';
import { variantLayouts, wearableOf, withVariants } from './roles';

// ═══════════════════════════════════════════════════════════════
// MAY THIS BE SERVED — one verification, for every moment the question is
// asked: when the server boots, when what the app consists of changes, and
// before an integration's bundle is let in.
//
// It reads a CANDIDATE, as values: what the app would consist of, which is
// not always what it consists of now. That is what lets a bundle be tried
// without being put into the manifest that is serving. And it is one
// function, so that a change cannot be accepted that a boot of the same
// manifest refuses.
//
// Pure. It answers a report and throws nothing; who asked decides what a
// refusal does (`refusalOf` writes the sentence).
// ═══════════════════════════════════════════════════════════════

export type ManifestCandidate = {
  charter: Charter;
  actions: Readonly<Record<string, ActionDefinition>>;
  // layout variants by variant id (ring 2)
  layouts: Readonly<Record<string, LayoutVariant>>;
  // the role combinations a principal may hold (./roles.ts, wearableOf)
  wearable: readonly (readonly string[])[];
  // every `<table>.<verb>` the database can carry: the universe the charter's
  // `data` section selects over
  grants: readonly string[];
  // the reads and writes the app serves, and the reach profiles its behaviors
  // declare
  entries: readonly (SeedEntry | SeedMutation)[];
  profiles: ReadonlySet<string>;
};

// WHAT A VERIFICATION READS OF WHAT AN APP SHIPPED: these fields of its
// manifest, and nothing of how it is served.
export type ShippedManifest = Pick<NiscApp, 'charter' | 'actions' | 'layouts' | 'wearable' | 'assignments' | 'entries' | 'behaviors'>;

// The candidate an app would be with `actions` and `entries` in force. The
// actions are its own, or its own with the sets that arrived while it runs
// laid over them. The entries are handed in by whoever holds them (the running
// manifest; `verifyApp` where there is none) and are not read off `shipped`.
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
  // WHAT REFUSES, one finding each, in the order the checks run. Empty: the
  // candidate may be served.
  errors: readonly { check: ManifestCheck; detail: string }[];
  // WHAT IS ONLY SAID. A trigger that re-emits its own channel (or a mount that
  // reloads itself) is valid data; nova stops it at its budget when it runs,
  // and this names it before anybody opens it. The app still serves.
  said: readonly string[];
  // The charter engine's own report, whole: its warnings (an action no role
  // grants, an allow that matches nothing) and each role's closure issues
  // refuse nothing, and a host that wants them reads them here.
  charter: VerifyReport;
};

// EVERY DEFINITION IS AN ACTION NOVA READS.
//
// What the app shipped was read by nova's schema when it was handed over
// (./schema.ts). A set that arrives while the app runs was not: it comes from
// rows, or over a wire, typed as actions by whoever handed it in. One that nova
// refuses would otherwise be taken, frozen and served, and found when a shell
// that holds it is built, for whoever connected first. So every definition of
// a candidate is read here, where the question "may this be served" is asked,
// and one that is not an action is the first thing that refuses.
//
// Asked how deep it nests before the schema reads it, as a manifest's
// documents are: a recursive schema recurses on the call stack.
const unreadActions = (actions: ManifestCandidate['actions']): { id: string; why: string }[] =>
  Object.entries(actions).flatMap(([id, definition]) => {
    if (exceedsDepth(definition)) return [{ id, why: depthRefusal() }];
    const read = ActionDefinitionSchema.safeParse(definition);
    if (read.success) return [];
    const first = read.error.issues[0];
    return [{ id, why: first === undefined ? 'no reason given' : `${first.path.join('.') || '(root)'}: ${first.message}` }];
  });

// A DECLARED REACH HAS TO NAME A PROFILE THAT EXISTS.
//
// An entry's `reach` is a string, matched at request time against the profiles
// the behaviors declare. A typo fails CLOSED — an unknown profile denies every
// table — which is the right runtime posture and a terrible way to find out:
// the screen comes back empty or refused and nothing says why. So it is
// checked against its universe here, like every other string in a manifest.
const reachErrors = (entries: ManifestCandidate['entries'], profiles: ReadonlySet<string>): string[] => {
  const unknown = entries.flatMap((entry) => (entry.reach !== undefined && !profiles.has(entry.reach) ? [`${entry.fingerprint} declares reach "${entry.reach}"`] : []));
  return unknown.length === 0 ? [] : [...unknown, `known profiles: ${[...profiles].join(', ') || '(none)'}`];
};

// A CHAIN OF STEPS THAT NEVER ENDS among a set of actions: a trigger that
// re-emits its own channel, a mount that reloads itself, and every longer loop
// through other actions. Each as the one line that names it, and the actions
// its steps run through: whoever asks about somebody else's actions (a bundle,
// laid over the host's) keeps the chains that run through those.
export type EndlessChain = { path: string; through: readonly string[] };

export const endlessChains = (actions: Readonly<Record<string, ActionDefinition>>): EndlessChain[] =>
  chainCycles(actions).map((cycle) => ({ path: cycle.path, through: cycle.steps.map((step) => step.action) }));

// The things a boot refuses or says, over one candidate: every definition
// is an action nova reads, the charter engine verifies (nova auditing each
// role's closure over its effective definitions, granted variants substituted;
// closure findings sit under `charter.perRole[].issues` and refuse nothing),
// every entry's reach names a profile, the layout variants are coherent, and
// the chains that never end are named.
//
// The checks after the first WALK the definitions, and a definition no schema
// has read can throw out of a walk (one nested deep enough ends the stack). So
// they are asked about the definitions that were read, and what was not read
// is already a refusal.
export const verifyManifest = (candidate: ManifestCandidate): ManifestReport => {
  const unread = unreadActions(candidate.actions);
  const refused = new Set(unread.map((action) => action.id));
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

// THE CHECK BOOT RUNS, FOR AN APP THAT IS NOT BOOTED: a check, a build step.
// `grants` is every `<table>.<verb>` the database can carry, which a server
// reads off the database it is given and a caller without one names itself
// (vex, `scopeGrants(tables)`). The report says what would refuse the boot
// (`errors`), what a boot only says (`said`), and carries the charter engine's
// own report whole (`charter`). A running server answers the same for what is
// in force: `charterReport()`, and `verifyActions` for a set it has not taken.
export const verifyApp = (app: ShippedManifest, grants: readonly string[]): ManifestReport =>
  verifyManifest(candidateOf(app, { actions: app.actions, entries: entriesOf(app) }, grants));

// The sentence a refusal is thrown with, or undefined when nothing refuses.
// One check's findings at a time, the first that failed: a manifest whose
// charter does not resolve says nothing useful about its variants. Two
// wordings, because who reads it differs: a boot that refuses serves nothing,
// and a change that is refused leaves what was being served.
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

// Ring-2 coherence (`verifyManifest` refuses on anything returned): every
// variant reshapes a shipped action, and no wearable combination the documents
// describe — each role alone, each assignment's union, the anonymous
// principal — resolves to two variants of one action.
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
  // COMBINATIONS, not people. This gate asks "can anything wearable resolve to
  // two variants of one action" — a question about the set of combinations.
  // `wearable` declares them; absent, they are derived from the assignment map.
  for (const roles of wearableOf(app)) wearers.set(`the combination [${[...roles].join(', ')}]`, roles);
  wearers.set('the anonymous principal', ['public']);
  for (const [who, roles] of wearers) {
    let granted: ReadonlySet<string>;
    try {
      granted = resolvePrincipal(app.charter, ids, roles, 'layouts');
    } catch {
      continue; // an unknown or cyclic role is the charter verifier's finding, not this one
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

// The per-role closure auditor — nova's own action audit, run over a
// role's granted set: each granted definition is checked against a world
// containing ONLY that set, and the issues kept are the CROSS-ACTION ones
// (a push target outside the closure). A definition-level wart (a loose
// bind, a dead ref) is not a closure break — the audit's other findings
// stay with the definition tooling. What this returns lands in the charter
// report's `perRole[].issues`; boot refuses on the report's `errors` only,
// so a closure break does not stop a boot.
//
// The role's granted variant ids ride in as the auditor's second argument
// (the charter verifier passes them): substituted before auditing, so the
// closure sees the role's EFFECTIVE definitions — a variant's push targets
// and channels are audited for exactly the roles that hold it. The
// substitution is the one a shell's definitions are made by (./roles.ts,
// `withVariants`): it is written there and nowhere else.
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
        // Cross-action wiring only — and a TEMPLATE target ({{…}}) is
        // resolved at runtime, not a static closure break.
        if (issue.includes('which is not in the catalog') && !issue.includes('{{')) issues.push(`${definition.id}: ${issue}`);
      }
    }
    return issues;
  };
};

// DOES A LAYOUT COMPOSE WHAT THE KIT HAS — the component names it uses, and
// the props it sets on each.
//
// The name is the floor: a component the terminal cannot render shows nothing,
// and at the moment somebody opens the screen rather than the moment it
// arrived. When the app carried a props schema for the component, the props
// are checked too: an unknown prop is the failure that installs cleanly and
// does nothing under a customer's finger, and a strict schema is exactly what
// refuses it.
//
// It is asked of a layout somebody else wrote, before it is let in (an
// integration's bundle). Only authored layouts are asked: a served or
// flattened tree is never held to an authoring schema.

// What the kit said of one component: the schema of its props, when the app
// carried one. A component with none is checked by its name alone.
export type KitComponents = ReadonlyMap<string, { propsSchema?: unknown }>;

// A prop VALUE that resolves at RENDER time, so nobody can know its type
// before: a binding string (`$.x`, `{{ }}`, `@scope` — nova's own isBinding),
// or a directive object (`$if`, `$eq`, `$prism` — a record carrying a
// `$`-prefixed key). Its KEY is still checked; only the value is skipped.
// Top-level by design — a binding buried inside an otherwise-static object
// value is not unwound.
const isDeferred = (value: unknown): boolean =>
  (typeof value === 'string' && isBinding(value)) || (isRecord(value) && Object.keys(value).some((key) => key.startsWith('$')));

// Each place a layout does not fit the kit, as a sentence, once: a component
// the app has none for, a prop the component has no place for, a value its
// schema refuses. Empty: the layout composes what the kit has.
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
    if (!(schema instanceof z.ZodObject) || !isRecord(props)) return; // name-only
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
