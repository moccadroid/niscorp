// .env (LLM keys) loads first — Node's own loader, no dependency; a
// missing file is fine (checks that never reach an LLM run without one).
try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import { createServer } from '@niscorp/moss';
import type { MossServer } from '@niscorp/moss';
import { relay } from '../app/app';
import { devRuntime } from './runtime';
import type { DevRuntime } from './runtime';

// The one composition: relay's artifacts + the dev runtime → the server.
// Consumed three ways — the standalone listener (serve.ts), vite's dev
// plugin (in-process, one `pnpm dev`), and the dev checks (in-process,
// no port, `runtime.db` as SQL ground truth).
export const boot = async (): Promise<{ server: MossServer; runtime: DevRuntime }> => {
  const runtime = await devRuntime();
  return { server: await createServer(relay, runtime), runtime };
};
