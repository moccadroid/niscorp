import type { ScopePolicy } from '@niscorp/vex';
import { CHARTER } from './charter';
import { rolesOf } from './assignments';
import { resolvePrincipal, dataUniverse } from './resolve';
import { policyFor } from './policy';
import { scopeBehaviors, TABLES } from '../vex/scope';

// ═══════════════════════════════════════════════════════════
// Relay glue — the per-principal side of the charter/vex compiler. Given a
// signed-in principal (or null = anonymous), resolve their `data` grants and
// compile the vex ScopePolicy the untrusted client surface (vexFetch) runs
// under. This is app wiring, NOT part of the liftable engine — it names
// relay's CHARTER, assignments, tables and behaviors. In the server this
// becomes the catalog service running the vex compiler at login.
// ═══════════════════════════════════════════════════════════

const DATA_UNIVERSE = dataUniverse(TABLES);

// The engine's DEFAULT policy — compiled from the charter's `system` role
// (the trusted path: direct engine callers — dev checks, Ray's query tool,
// the architect's generative reads). The charter owns the trusted floor too:
// all reads, writes only where a mutation surface exists, and an unlisted
// verb dies even here. The untrusted client surface (vexFetch) OVERRIDES it
// per principal.
export const systemPolicy = policyFor(
  resolvePrincipal(CHARTER, DATA_UNIVERSE, ['system'], 'data'),
  scopeBehaviors,
);

// The `table.verb` capabilities this principal holds.
export const dataGrantsFor = (principalId: string | null): Set<string> =>
  resolvePrincipal(CHARTER, DATA_UNIVERSE, rolesOf(principalId), 'data');

// The vex ScopePolicy this principal reads and writes under — the compiled
// grant set × the app's row behaviors. An ungranted phase is simply absent,
// and vex's own default-deny refuses it. Memoized: the charter and the
// assignments are static for the session, so a principal's policy is too
// (the server story compiles at login; this is the client-proof equivalent).
const policyMemo = new Map<string | null, ScopePolicy>();
export const policyForPrincipal = (principalId: string | null): ScopePolicy => {
  const hit = policyMemo.get(principalId);
  if (hit !== undefined) return hit;
  const policy = policyFor(dataGrantsFor(principalId), scopeBehaviors);
  policyMemo.set(principalId, policy);
  return policy;
};

// NOTE deliberately absent: no per-principal permission data is exported to
// the presentation layer. Different principals see different layouts via
// ring 1 (a different catalog) and, later, ring 2 (served variants) — never
// via runtime permission flags threaded through layouts. An affordance a
// principal can't use dies in vex (scope_denied) until its variant exists.
