// .env (LLM keys) loads first — Node's own loader, no dependency; a
// missing file is fine (checks that never reach an LLM run without one).
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

// The one composition: relay's artifacts + the dev runtime → the server.
// Consumed three ways — the standalone listener (serve.ts), vite's dev
// plugin (in-process, one `pnpm dev`), and the dev checks (in-process,
// no port, `runtime.db` as SQL ground truth).
export const boot = async (): Promise<{ server: MossServer; runtime: DevRuntime }> => {
  const runtime = await devRuntime();
  return { server: await serverOn(runtime), runtime };
};

// The server over an environment it is handed. Ray's engine reads the database
// this app created and runs under the caller's policy; a session carries
// neither, so both are closed over here: the runtime as it is, and the policy
// asked of the server once it stands (`policyForRoles` answers a copy that is
// the caller's own). One policy is kept for each set of roles, because Ray
// keeps one engine for each policy. Relay's charter does not change while it
// runs, so what is kept does not go stale.
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
