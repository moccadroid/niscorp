import { createScopePolicy } from '@niscorp/vex';
import type { ScopePolicy } from '@niscorp/vex';
import { resolvePrincipal } from '@niscorp/charter';
import type { LayoutNode } from '@niscorp/nova';
import type { NiscApp } from './app';

// ═══════════════════════════════════════════════════════════════
// Per-principal resolution — what the catalog service does at login:
// roles from the assignment rows, the granted action ids (with the
// resolved-set version token), and the compiled vex ScopePolicy. All
// pure; the server memoizes (the documents are static per process).
// ═══════════════════════════════════════════════════════════════

export const resolveRoles = (app: NiscApp, principal: string | null): readonly string[] =>
  principal === null ? ['public'] : (app.assignments[principal] ?? ['public']);

// The compiled ScopePolicy this principal reads and writes under: their
// resolved `data` grants × the app's row behaviors. An ungranted phase is
// absent, and vex's default-deny refuses it.
export const resolvePolicy = (app: NiscApp, grants: readonly string[], principal: string | null): ScopePolicy =>
  createScopePolicy(resolvePrincipal(app.charter, grants, resolveRoles(app, principal), 'data'), app.behaviors ?? {});

export type Catalog = { ids: readonly string[]; hash: string };

// The application, resolved for one principal — granted action ids plus
// the version token (equal hash, equal application; pushed over the
// socket as the catalog-change signal).
export const resolveCatalog = (app: NiscApp, principal: string | null): Catalog => {
  const ids = [...resolvePrincipal(app.charter, Object.keys(app.actions), resolveRoles(app, principal), 'actions')].sort();
  return { ids, hash: versionToken(ids) };
};

// The principal's layout bindings — action id → the granted variant's
// layout (ring 2). Grants come from the charter's `layouts` section over
// the variant-id universe. Two granted variants of one action is
// incoherence `verifyVariants` refused at boot, so resolution never picks.
export const resolveVariants = (app: NiscApp, principal: string | null): ReadonlyMap<string, LayoutNode> => {
  const variants = app.layouts ?? {};
  const granted = resolvePrincipal(app.charter, Object.keys(variants), resolveRoles(app, principal), 'layouts');
  const bindings = new Map<string, LayoutNode>();
  for (const id of granted) {
    const variant = variants[id];
    if (variant !== undefined) bindings.set(variant.action, variant.layout);
  }
  return bindings;
};

// The boot-time coherence gate for ring 2 (server.ts throws on anything
// returned): every variant reshapes a shipped action, and no wearable
// combination the documents describe — each role alone, each assignment's
// union, the anonymous principal — resolves to two variants of one action.
export const verifyVariants = (app: NiscApp): string[] => {
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
  for (const [principal, roles] of Object.entries(app.assignments)) wearers.set(`principal "${principal}"`, roles);
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

// A content hash of the resolved id set — identity, not cryptography
// (FNV-1a, hex).
const versionToken = (ids: readonly string[]): string => {
  const s = ids.join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};
