try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import { createServer } from '@niscorp/moss';
import type { MossServer, NiscRuntime } from '@niscorp/moss';
import { buildRelay } from '../app/app';
import { devRuntime } from './runtime';
import type { DevRuntime } from './runtime';

export const boot = async (): Promise<{ server: MossServer; runtime: DevRuntime }> => {
  const runtime = await devRuntime();
  return { server: await serverOn(runtime), runtime };
};

export const serverOn = async (runtime: NiscRuntime): Promise<MossServer> => createServer(buildRelay(), runtime);
