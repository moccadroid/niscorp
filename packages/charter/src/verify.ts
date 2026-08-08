import type { Charter, Section } from './types';
import { matchAll } from './glob';
import { CharterError, normalizeRole, resolveRole } from './resolve';

// ═══════════════════════════════════════════════════════════
// The verifier — the other half of the charter (DESIGN.md § The verifier
// is the other half). The grammar
// stays small; the opinions live here. Boot/CI runs it and refuses an
// incoherent charter: "if it boots, it's coherent."
//
// Every check runs PER SECTION against that section's universe. Like the
// resolver, the verifier is universe-blind: every universe is HANDED IN
// (the atoms are each governed target's own dialect — nova action ids, vex
// verb leaves), and the per-role closure audit is an injected hook (nova
// exports one), so this module imports nothing. Severities are asymmetric
// on purpose: a dead DENY is an error (a typo'd deny fails silent, and
// silent means unprotected); a dead allow is a warning.
// ═══════════════════════════════════════════════════════════

export type VerifyIssue = { level: 'error' | 'warning'; rule: string; detail: string };

export type RoleClosure = { role: string; actions: string[]; data: string[]; layouts: string[]; issues: string[] };

export type VerifyReport = { errors: VerifyIssue[]; warnings: VerifyIssue[]; perRole: RoleClosure[] };

// The per-role closure audit: given a role's granted action ids (and, when
// the app governs layouts, its granted layout-variant ids), report the
// cross-action wiring problems inside that closure (targets that aren't in
// it, channels nobody serves). The consumer that OWNS actions provides it —
// moss builds one from nova's audit, substituting granted variants so the
// closure sees each role's EFFECTIVE definitions.
export type ClosureAuditor = (grantedIds: readonly string[], layoutIds?: readonly string[]) => string[];

export const verifyCharter = (
  charter: Charter,
  universes: { actions: readonly string[]; data: readonly string[]; layouts?: readonly string[] },
  assignments: Record<string, readonly string[]> = {},
  closure?: ClosureAuditor,
): VerifyReport => {
  const actionUniverse = universes.actions;
  // The layouts section is verified only when the composer governs layouts
  // (hands a universe in) — absent, a charter's `layouts` keys are inert
  // here exactly as they are in resolution against an empty universe.
  const sections: Section[] = universes.layouts === undefined ? ['actions', 'data'] : ['actions', 'data', 'layouts'];
  const universeOf: Record<Section, readonly string[]> = {
    actions: universes.actions,
    data: universes.data,
    layouts: universes.layouts ?? [],
  };

  const errors: VerifyIssue[] = [];
  const warnings: VerifyIssue[] = [];
  const perRole: RoleClosure[] = [];

  // Resolve every role in every section up front (also surfaces cycles /
  // unknown references, per section).
  const resolved: Record<Section, Map<string, ReadonlySet<string>>> = { actions: new Map(), data: new Map(), layouts: new Map() };
  for (const section of sections) {
    const memo = new Map<string, ReadonlySet<string>>();
    for (const role of Object.keys(charter)) {
      try {
        resolved[section].set(role, resolveRole(charter, universeOf[section], role, section, memo));
      } catch (e) {
        errors.push({ level: 'error', rule: 'resolution', detail: `${section}: ${e instanceof CharterError ? e.message : String(e)}` });
      }
    }
  }

  // ── ids are leaves; namespaces are never actions. Same rule inside the
  //    layouts universe — a variant id is never a namespace of another ──
  const leavesOnly = (universe: readonly string[], kind: string): void => {
    for (const a of universe) {
      for (const b of universe) {
        if (b.startsWith(`${a}.`)) {
          errors.push({ level: 'error', rule: 'leaves-only', detail: `id "${a}" is a namespace of "${b}" — namespaces are never ${kind}` });
          break;
        }
      }
    }
  };
  leavesOnly(actionUniverse, 'actions');
  if (universes.layouts !== undefined) leavesOnly(universes.layouts, 'variants');

  // ── one selection per section: top-level allow/deny (the actions sugar)
  //    AND an `actions` key on the same role means resolution silently drops
  //    the sugar — silent means wrong, so boot refuses ──
  for (const [role, def] of Object.entries(charter)) {
    if (Array.isArray(def)) continue;
    if (def.actions !== undefined && (def.allow !== undefined || def.deny !== undefined)) {
      errors.push({ level: 'error', rule: 'ambiguous-selection', detail: `role "${role}" has both top-level allow/deny and an "actions" section — one selection per section` });
    }
  }

  // ── dead deny = error, dead allow = warning; per glob, per role, per section ──
  for (const section of sections) {
    for (const [role, def] of Object.entries(charter)) {
      const { allow, deny } = normalizeRole(def, section);
      for (const glob of deny) {
        if (matchAll([glob], universeOf[section]).size === 0) {
          errors.push({ level: 'error', rule: 'dead-deny', detail: `role "${role}" denies "${glob}" (${section}) which matches nothing — silent means unprotected` });
        }
      }
      for (const glob of allow) {
        if (matchAll([glob], universeOf[section]).size === 0) {
          warnings.push({ level: 'warning', rule: 'dead-allow', detail: `role "${role}" allows "${glob}" (${section}) which matches nothing` });
        }
      }
    }
  }

  // ── orphans: matched by no role at all. Actions and layout variants share
  //    the rule — both are deployed-but-unreachable artifacts. An ungranted
  //    data phase is simply denied, not a mistake ──
  const orphans = (section: Section, kind: string): void => {
    const reachable = new Set<string>();
    for (const set of resolved[section].values()) for (const id of set) reachable.add(id);
    for (const id of universeOf[section]) {
      if (!reachable.has(id)) warnings.push({ level: 'warning', rule: 'orphan', detail: `${kind} "${id}" is granted by no role — deployed but unreachable` });
    }
  };
  orphans('actions', 'action');
  if (universes.layouts !== undefined) orphans('layouts', 'layout variant');

  // ── re-allow of an ancestor's deny (F1), per section ──
  const ancestorDenied = (role: string, section: Section, seen: Set<string> = new Set()): Set<string> => {
    const out = new Set<string>();
    const def = charter[role];
    if (def === undefined || seen.has(role)) return out;
    seen.add(role);
    for (const parent of normalizeRole(def, section).extends) {
      const parentDef = charter[parent];
      if (parentDef === undefined) continue;
      for (const id of matchAll(normalizeRole(parentDef, section).deny, universeOf[section])) out.add(id);
      for (const id of ancestorDenied(parent, section, seen)) out.add(id);
    }
    return out;
  };
  for (const section of sections) {
    for (const [role, set] of resolved[section]) {
      for (const id of ancestorDenied(role, section)) {
        if (set.has(id)) {
          warnings.push({ level: 'warning', rule: 're-allow', detail: `role "${role}" re-allows "${id}" (${section}) which an ancestor denied` });
        }
      }
    }
  }

  // ── a role referenced in `without` that principals also wear (F2) ──
  const subtractive = new Set<string>();
  for (const def of Object.values(charter)) {
    if (Array.isArray(def)) continue;
    for (const sub of def.without ?? []) subtractive.add(sub);
  }
  const worn = new Set(Object.values(assignments).flat());
  for (const role of subtractive) {
    if (worn.has(role)) {
      warnings.push({ level: 'warning', rule: 'subtractive-assigned', detail: `role "${role}" is referenced in "without" but is also assigned to a principal` });
    }
  }

  // ── per-role closure: the action-catalog audit (cross-action wiring),
  //    fed the role's granted variants so it audits EFFECTIVE definitions ──
  for (const role of Object.keys(charter)) {
    const actions = [...(resolved.actions.get(role) ?? [])].sort();
    const data = [...(resolved.data.get(role) ?? [])].sort();
    const layouts = [...(resolved.layouts.get(role) ?? [])].sort();
    const issues = closure?.(actions, layouts) ?? [];
    perRole.push({ role, actions, data, layouts, issues });
  }

  return { errors, warnings, perRole };
};
