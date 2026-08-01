import { collectInteractive } from '../agent/affordances';
import { MUTATION_KEYS } from './grammar';
import type { ActionDefinition } from './schemas';

// ═══════════════════════════════════════════════════════════
// auditAction — static analysis of an ActionDefinition's internal wiring.
//
// A definition can parse, mount, and render politely while being broken in
// every way that matters: a table bound to a key no endpoint fills, a search
// box whose trigger re-calls a load that never reads it, a ref with no
// trigger (dead chrome), a push into an action that doesn't exist. None of
// that is visible to a schema parse or a mount probe — it IS visible in the
// artifact. This audits the definition deterministically: every claim is a
// cross-reference inside the definition (plus an optional catalog), so there
// are no heuristics and no false authority.
//
// Scope: SELF-CONTAINED definitions with an inline layout — generated
// actions above all. Hand-authored actions that receive triggers from
// fragments (`with: [...]`) or bind stored layouts will report issues that
// composition would resolve; audit the COMPOSED definition instead, or skip.
// ═══════════════════════════════════════════════════════════

export type AuditCatalogEntry = {
  id: string;
  // The action's openable-input contract (a JSON Schema). When it carries
  // `properties`, seeded push input keys are checked against them.
  input?: Record<string, unknown>;
};

export type AuditOptions = {
  // Known pushable action ids. When given, every push/replace/resetTo
  // target must be one of them (or the definition's own id), with input
  // keys from its contract.
  catalog?: ReadonlyArray<AuditCatalogEntry>;
  // Known message channels (derive them from the registered definitions —
  // see collectChannels). When given, a `message:` listen must name a known
  // channel or one this definition emits itself; an `emit` must name a known
  // channel or one this definition listens on. Catches the silent
  // never-fires class ("tasks:changed" vs "tasks-changed").
  channels?: ReadonlyArray<string>;
};

export type AuditResult = { ok: boolean; issues: string[] };

// The channels a definition talks on — every `message:` trigger (listens)
// and every `emit` step (emits), nested steps included. Walk a whole
// registry's definitions to derive the app's live channel vocabulary.
export type ChannelUsage = { emits: string[]; listens: string[] };

export const collectChannels = (definition: ActionDefinition): ChannelUsage => {
  const emits = new Set<string>();
  const listens = new Set<string>();

  const walkSteps = (list: unknown): void => {
    if (!Array.isArray(list)) return;
    for (const step of list) {
      if (!isRecord(step)) continue;
      const emit = step['emit'];
      if (isRecord(emit) && typeof emit['channel'] === 'string') emits.add(emit['channel']);
      if (typeof step['call'] === 'string') {
        walkSteps(step['onSuccess']);
        walkSteps(step['onError']);
      }
    }
  };
  for (const trigger of definition.triggers ?? []) {
    if (typeof trigger.message === 'string') listens.add(trigger.message);
    walkSteps(trigger.do);
  }
  for (const hook of Object.values(definition.lifecycle ?? {})) walkSteps(hook);

  return { emits: [...emits].sort(), listens: [...listens].sort() };
};

// Mutation ops whose value is a data PATH (see action/mutations/ops). The
const firstSegment = (path: string): string => {
  const segment = path.split('.')[0];
  return segment === undefined || segment.length === 0 ? path : segment;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

type NavTarget = { action: string; input?: Record<string, unknown> };

const navTargetOf = (step: Record<string, unknown>): NavTarget | undefined => {
  for (const key of ['push', 'replace', 'resetTo']) {
    const value = step[key];
    if (isRecord(value) && typeof value['action'] === 'string') {
      const input = value['input'];
      return { action: value['action'], ...(isRecord(input) ? { input } : {}) };
    }
  }
  return undefined;
};

export const auditAction = (definition: ActionDefinition, options?: AuditOptions): AuditResult => {
  const issues: string[] = [];
  const dataKeys = new Set(Object.keys(definition.data ?? {}));
  const endpointNames = new Set(Object.keys(definition.endpoints ?? {}));

  // ── collect every step (structurally — nested onSuccess/onError included),
  //    wherever steps live: triggers and lifecycle hooks ──
  const steps: Record<string, unknown>[] = [];
  const pushSteps = (list: unknown): void => {
    if (!Array.isArray(list)) return;
    for (const step of list) {
      if (!isRecord(step)) continue;
      steps.push(step);
      if (typeof step['call'] === 'string') {
        pushSteps(step['onSuccess']);
        pushSteps(step['onError']);
      }
    }
  };
  for (const trigger of definition.triggers ?? []) pushSteps(trigger.do);
  for (const hook of Object.values(definition.lifecycle ?? {})) pushSteps(hook);

  // ── steps: calls name real endpoints; mutations write declared keys;
  //    navigation targets exist in the catalog with legal input keys ──
  for (const step of steps) {
    const call = step['call'];
    if (typeof call === 'string' && !endpointNames.has(call)) {
      issues.push(`step calls endpoint "${call}" but endpoints has no "${call}"`);
    }

    for (const key of MUTATION_KEYS) {
      const path = step[key];
      if (typeof path === 'string' && path.length > 0 && !dataKeys.has(firstSegment(path))) {
        issues.push(`step "${key}: ${path}" writes a key with no default in data`);
      }
    }

    const nav = navTargetOf(step);
    if (nav !== undefined && options?.catalog !== undefined) {
      const entry = options.catalog.find((candidate) => candidate.id === nav.action);
      if (entry === undefined && nav.action !== definition.id) {
        issues.push(`step pushes action "${nav.action}" which is not in the catalog`);
        continue;
      }
      const properties = entry?.input?.['properties'];
      if (nav.input !== undefined && isRecord(properties)) {
        for (const key of Object.keys(nav.input)) {
          if (!(key in properties)) {
            issues.push(`push to "${nav.action}" seeds input key "${key}" which is not in its input contract`);
          }
        }
      }
    }
  }

  // ── endpoints: targets land on declared keys ──
  for (const [name, endpoint] of Object.entries(definition.endpoints ?? {})) {
    for (const field of ['target', 'errorTarget'] as const) {
      const target = endpoint[field];
      if (typeof target === 'string' && target.length > 0 && !dataKeys.has(firstSegment(target))) {
        issues.push(`endpoint "${name}" ${field} "${target}" has no default in data`);
      }
    }
  }

  // ── message channels (when the app's vocabulary is provided) ──
  if (options?.channels !== undefined) {
    const known = new Set(options.channels);
    const usage = collectChannels(definition);
    for (const channel of usage.listens) {
      if (!known.has(channel) && !usage.emits.includes(channel)) {
        issues.push(`trigger listens on channel "${channel}" which nothing is known to emit`);
      }
    }
    for (const channel of usage.emits) {
      if (!known.has(channel) && !usage.listens.includes(channel)) {
        issues.push(`step emits channel "${channel}" which nothing is known to listen on`);
      }
    }
  }

  // ── layout ↔ data ↔ triggers (inline layouts only) ──
  if (definition.layout !== undefined && typeof definition.layout !== 'string') {
    const surface = collectInteractive(definition.layout);

    for (const key of surface.boundKeys) {
      if (!dataKeys.has(key)) {
        issues.push(`layout binds "$.${key}" but data has no "${key}" default`);
      }
    }

    for (const suspect of surface.suspectBindings) {
      issues.push(
        `layout binding "${suspect}…" is malformed — the data root is "$." ("$.key"), and "$name." is only legal for a loop variable declared by an enclosing for/as`,
      );
    }

    const layoutRefs = new Set(surface.refs.map((entry) => entry.ref));
    const triggerRefs = new Set(
      (definition.triggers ?? [])
        .map((trigger) => trigger.ref)
        .filter((ref): ref is string => typeof ref === 'string'),
    );
    for (const ref of layoutRefs) {
      if (!triggerRefs.has(ref)) {
        issues.push(`layout ref "${ref}" has no trigger — dead chrome`);
      }
    }
    for (const ref of triggerRefs) {
      if (!layoutRefs.has(ref)) {
        issues.push(`trigger listens on ref "${ref}" but no layout node carries it`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
};
