import { auditAction, collectChannels, type ActionDefinition, type AuditCatalogEntry } from '@niscorp/nova';
import type { Charter } from './types';
import { matchAll } from './glob';
import { CharterError, normalizeRole, resolveRole } from './resolve';

// ═══════════════════════════════════════════════════════════
// The verifier — the other half of the charter (CHARTER.md). The grammar
// stays four keys; the opinions live here. Boot/CI runs this and refuses an
// incoherent charter: "if it boots, it's coherent."
//
// Severities are CHARTER.md's, asymmetric on purpose: a dead DENY is an
// error (a typo'd deny fails silent, and silent means unprotected); a dead
// allow is a warning.
// ═══════════════════════════════════════════════════════════

export type VerifyIssue = { level: 'error' | 'warning'; rule: string; detail: string };

// Per-role reachability closure: nav targets and channels of the granted
// definitions, cross-referenced inside the granted set only. An issue here
// is a button whose target the role cannot reach — shown, not hidden
// (ring-2 shaping is a different layer).
export type RoleClosure = { role: string; granted: string[]; issues: string[] };

export type VerifyReport = { errors: VerifyIssue[]; warnings: VerifyIssue[]; perRole: RoleClosure[] };

// Closure keeps only cross-ACTION wiring: catalog misses and channel
// mismatches. Layout/data lints belong to the devtools audit, and dynamic
// template targets ("{{$.chosen_id}}") are unknowable statically.
const closureIssue = (issue: string): boolean =>
  !issue.includes('{{') && (issue.includes('not in the catalog') || issue.includes('channel'));

export const verifyCharter = (
  charter: Charter,
  definitions: Record<string, ActionDefinition>,
  assignments: Record<string, readonly string[]> = {},
): VerifyReport => {
  const ids = Object.keys(definitions);
  const errors: VerifyIssue[] = [];
  const warnings: VerifyIssue[] = [];
  const perRole: RoleClosure[] = [];
  const memo = new Map<string, ReadonlySet<string>>();

  // ── resolve every role; cycles/unknown references are errors ──
  const resolved = new Map<string, ReadonlySet<string>>();
  for (const role of Object.keys(charter)) {
    try {
      resolved.set(role, resolveRole(charter, ids, role, memo));
    } catch (e) {
      errors.push({ level: 'error', rule: 'resolution', detail: e instanceof CharterError ? e.message : String(e) });
    }
  }

  // ── ids are leaves; namespaces are never actions ──
  for (const a of ids) {
    for (const b of ids) {
      if (b.startsWith(`${a}.`)) {
        errors.push({ level: 'error', rule: 'leaves-only', detail: `id "${a}" is a namespace of "${b}" — namespaces are never actions` });
        break;
      }
    }
  }

  // ── dead deny = error, dead allow = warning; per glob, per role ──
  for (const [role, def] of Object.entries(charter)) {
    const { allow, deny } = normalizeRole(def);
    for (const glob of deny) {
      if (matchAll([glob], ids).size === 0) {
        errors.push({ level: 'error', rule: 'dead-deny', detail: `role "${role}" denies "${glob}" which matches nothing — silent means unprotected` });
      }
    }
    for (const glob of allow) {
      if (matchAll([glob], ids).size === 0) {
        warnings.push({ level: 'warning', rule: 'dead-allow', detail: `role "${role}" allows "${glob}" which matches nothing` });
      }
    }
  }

  // ── orphan actions: matched by no role at all ──
  const reachable = new Set<string>();
  for (const set of resolved.values()) for (const id of set) reachable.add(id);
  for (const id of ids) {
    if (!reachable.has(id)) warnings.push({ level: 'warning', rule: 'orphan', detail: `action "${id}" is granted by no role — deployed but unreachable` });
  }

  // ── re-allow of an ancestor's deny (F1): flagged loudly, never blocked ──
  const ancestorDenied = (role: string, seen: Set<string> = new Set()): Set<string> => {
    const out = new Set<string>();
    const def = charter[role];
    if (def === undefined || seen.has(role)) return out;
    seen.add(role);
    for (const parent of normalizeRole(def).extends) {
      const parentDef = charter[parent];
      if (parentDef === undefined) continue;
      for (const id of matchAll(normalizeRole(parentDef).deny, ids)) out.add(id);
      for (const id of ancestorDenied(parent, seen)) out.add(id);
    }
    return out;
  };
  for (const [role, set] of resolved) {
    for (const id of ancestorDenied(role)) {
      if (set.has(id)) {
        warnings.push({ level: 'warning', rule: 're-allow', detail: `role "${role}" re-allows "${id}" which an ancestor denied` });
      }
    }
  }

  // ── a role referenced in `without` that principals also wear (F2) ──
  const subtractive = new Set<string>();
  for (const def of Object.values(charter)) for (const sub of normalizeRole(def).without) subtractive.add(sub);
  const worn = new Set(Object.values(assignments).flat());
  for (const role of subtractive) {
    if (worn.has(role)) {
      warnings.push({ level: 'warning', rule: 'subtractive-assigned', detail: `role "${role}" is referenced in "without" but is also assigned to a principal` });
    }
  }

  // ── per-role closure: audit each granted definition against the granted
  //    catalog and the granted channel vocabulary ──
  for (const [role, set] of resolved) {
    const granted = [...set].sort();
    const grantedDefs = granted.map((id) => definitions[id]).filter((d): d is ActionDefinition => d !== undefined);
    const catalog: AuditCatalogEntry[] = grantedDefs.map((d) => ({ id: d.id, ...(d.input !== undefined ? { input: d.input } : {}) }));
    const channels = [...new Set(grantedDefs.flatMap((d) => {
      const usage = collectChannels(d);
      return [...usage.emits, ...usage.listens];
    }))];
    const issues = grantedDefs.flatMap((d) =>
      auditAction(d, { catalog, channels }).issues.filter(closureIssue).map((issue) => `${d.id}: ${issue}`),
    );
    perRole.push({ role, granted, issues });
  }

  return { errors, warnings, perRole };
};
