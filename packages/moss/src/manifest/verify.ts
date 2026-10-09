import { resolvePrincipal } from '@niscorp/charter';
import type { NiscApp } from './app';
import { wearableOf } from './roles';

// The boot-time coherence gate for ring 2 (server.ts throws on anything
// returned): every variant reshapes a shipped action, and no wearable
// combination the documents describe — each role alone, each assignment's
// union, the anonymous principal — resolves to two variants of one action.
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
  // two variants of one action" — a question about the set of combinations,
  // which walking the population answered only by accident. `wearable` declares
  // them; absent, they are derived from the assignment map exactly as before.
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
