import { createScopePolicy } from '@niscorp/vex';
import type { ScopePolicy } from '@niscorp/vex';
import { resolvePrincipal } from '@niscorp/charter';
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
// socket at step 3b as the catalog-change signal).
export const resolveCatalog = (app: NiscApp, principal: string | null): Catalog => {
  const ids = [...resolvePrincipal(app.charter, Object.keys(app.actions), resolveRoles(app, principal), 'actions')].sort();
  return { ids, hash: versionToken(ids) };
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
