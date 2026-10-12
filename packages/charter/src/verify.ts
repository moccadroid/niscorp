import type { Charter, Section } from './types';
import { matchAll } from './glob';
import { CharterError, normalizeRole, resolveRole } from './resolve';

export type VerifyIssue = { level: 'error' | 'warning'; rule: string; detail: string };

export type RoleClosure = { role: string; actions: string[]; data: string[]; layouts: string[]; issues: string[] };

export type VerifyReport = { errors: VerifyIssue[]; warnings: VerifyIssue[]; perRole: RoleClosure[] };

export type ClosureAuditor = (grantedIds: readonly string[], layoutIds?: readonly string[]) => string[];

export const verifyCharter = (
  charter: Charter,
  universes: { actions: readonly string[]; data: readonly string[]; layouts?: readonly string[] },
  // One entry per combination of roles a principal may hold, not one per principal.
  wearable: readonly (readonly string[])[] = [],
  closure?: ClosureAuditor,
): VerifyReport => {
  const actionUniverse = universes.actions;
  const sections: Section[] = universes.layouts === undefined ? ['actions', 'data'] : ['actions', 'data', 'layouts'];
  const universeOf: Record<Section, readonly string[]> = {
    actions: universes.actions,
    data: universes.data,
    layouts: universes.layouts ?? [],
  };

  const errors: VerifyIssue[] = [];
  const warnings: VerifyIssue[] = [];
  const perRole: RoleClosure[] = [];

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

  for (const [role, def] of Object.entries(charter)) {
    if (Array.isArray(def)) continue;
    if (def.actions !== undefined && (def.allow !== undefined || def.deny !== undefined)) {
      errors.push({ level: 'error', rule: 'ambiguous-selection', detail: `role "${role}" has both top-level allow/deny and an "actions" section — one selection per section` });
    }
  }

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

  // Not run for `data`: a data id no role grants is denied, which is not a mistake.
  const orphans = (section: Section, kind: string): void => {
    const reachable = new Set<string>();
    for (const set of resolved[section].values()) for (const id of set) reachable.add(id);
    for (const id of universeOf[section]) {
      if (!reachable.has(id)) warnings.push({ level: 'warning', rule: 'orphan', detail: `${kind} "${id}" is granted by no role — deployed but unreachable` });
    }
  };
  orphans('actions', 'action');
  if (universes.layouts !== undefined) orphans('layouts', 'layout variant');

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

  const subtractive = new Set<string>();
  for (const def of Object.values(charter)) {
    if (Array.isArray(def)) continue;
    for (const sub of def.without ?? []) subtractive.add(sub);
  }
  const worn = new Set(wearable.flat());
  for (const role of subtractive) {
    if (worn.has(role)) {
      warnings.push({ level: 'warning', rule: 'subtractive-assigned', detail: `role "${role}" is referenced in "without" but is also assigned to a principal` });
    }
  }

  for (const role of Object.keys(charter)) {
    const actions = [...(resolved.actions.get(role) ?? [])].sort();
    const data = [...(resolved.data.get(role) ?? [])].sort();
    const layouts = [...(resolved.layouts.get(role) ?? [])].sort();
    const issues = closure?.(actions, layouts) ?? [];
    perRole.push({ role, actions, data, layouts, issues });
  }

  return { errors, warnings, perRole };
};
