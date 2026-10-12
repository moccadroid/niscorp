import { createScopePolicy, scopeGrants } from '@niscorp/vex';
import { resolvePrincipal } from '@niscorp/charter';
import { CHARTER } from '@relay/app/charter';
import { scopeBehaviors } from '@relay/app/vex/behaviors';
import { TABLES } from '@relay/db/schema';
import { devRuntime } from '../server/runtime';
import type { Shell } from '@niscorp/nova';
import { rayEngine } from '@relay/server/functions/ray/engine';
import type { RayContext, RayEngine } from '@relay/server/functions/ray/engine';

export const systemPolicy = createScopePolicy(
  resolvePrincipal(CHARTER, scopeGrants(TABLES), ['system'], 'data'),
  scopeBehaviors,
);

let booted: Promise<RayEngine> | undefined;
export const getVexRuntime = (): Promise<RayEngine> => {
  booted ??= (async () => rayEngine(await devRuntime(), systemPolicy))();
  return booted;
};

export const devRayContext = (userId = 'usr_001'): RayContext => ({
  get shell(): Shell {
    throw new Error('no session shell in this harness');
  },
  userId,
  policy: systemPolicy,
  engine: getVexRuntime,
});
