try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import { createServer } from '@niscorp/moss';
import type { MossServer, NiscRuntime } from '@niscorp/moss';
import type { ScopePolicy } from '@niscorp/vex';
import { buildRelay } from '../app/app';
import { devRuntime } from './runtime';
import type { DevRuntime } from './runtime';

export const boot = async (): Promise<{ server: MossServer; runtime: DevRuntime }> => {
  const runtime = await devRuntime();
  return { server: await serverOn(runtime), runtime };
};

// One policy is kept for each set of roles: Ray keeps one engine for each policy
// object. The charter does not change while relay runs, so it does not go stale.
export const serverOn = async (runtime: NiscRuntime): Promise<MossServer> => {
  let built: MossServer | undefined;
  const policies = new Map<string, ScopePolicy>();
  const policyFor = (roles: readonly string[]): ScopePolicy => {
    if (built === undefined) throw new Error('relay: a session asked for its policy before the server was up');
    const key = [...roles].sort().join('\u0000');
    const kept = policies.get(key);
    if (kept !== undefined) return kept;
    const compiled = built.policyForRoles(roles);
    policies.set(key, compiled);
    return compiled;
  };
  built = await createServer(buildRelay({ runtime, policyFor }), runtime);
  return built;
};
