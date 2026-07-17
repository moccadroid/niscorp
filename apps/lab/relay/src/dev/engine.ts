import { createScopePolicy, scopeGrants, seedCache } from '@niscorp/vex';
import { ENTRIES, MUTATION_ENTRIES } from '@relay/app/data/api';
import { resolvePrincipal } from '@niscorp/charter';
import { CHARTER } from '@relay/app/charter';
import { scopeBehaviors } from '@relay/app/data/behaviors';
import { TABLES } from '@relay/app/data/schema';
import { devRuntime } from '../server/runtime';
import type { Shell } from '@niscorp/nova';
import { rayEngine } from '@relay/server/functions/ray/engine';
import type { RayContext, RayEngine } from '@relay/server/functions/ray/engine';

// The checks' headless ground: Ray's engine over the dev database under
// the charter's `system` role (the trusted floor). App sessions never see
// this — moss compiles per principal; only dev checks run as `system`.

export const systemPolicy = createScopePolicy(
  resolvePrincipal(CHARTER, scopeGrants(TABLES), ['system'], 'data'),
  scopeBehaviors,
);

let booted: Promise<RayEngine> | undefined;
export const getVexRuntime = (): Promise<RayEngine> => {
  booted ??= (async () => {
    const dev = await devRuntime();
    // The API surface, from the ONE declaration (the manifest's entries) —
    // moss's data layer does the same over the same database.
    await seedCache(dev.cache, [...ENTRIES, ...MUTATION_ENTRIES]);
    return rayEngine(dev, systemPolicy);
  })();
  return booted;
};

// A RayContext for harnesses that run WITHOUT a session shell (the
// architect checks mount throwaway shells of their own): system authority,
// an explicit user, and a loud failure if anything reaches for the
// session shell.
export const devRayContext = (userId = 'usr_001'): RayContext => ({
  get shell(): Shell {
    throw new Error('no session shell in this harness');
  },
  userId,
  policy: systemPolicy,
  engine: getVexRuntime,
});
