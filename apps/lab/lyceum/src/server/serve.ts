// Lyceum standalone: `pnpm --filter lyceum serve` — the deployed shape. One
// process, one port: moss (/api, /catalog, /socket), the one-time sign-in
// (/login, /speaker, /stage), and the built terminal (dist/). `pnpm --filter lyceum dev` runs
// the same boot inside vite instead.
//
// DATABASE_URL set → Postgres (the deployment). Unset → in-memory PGlite, reset
// on every start, and it says so.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { attachSocket } from '@niscorp/moss/node';
import { bootOn } from './boot';
import { devRuntime } from './runtime';
import { postgresRuntime } from './postgres-runtime';
import { mountLogin } from './login';
import { mountSite } from './site';

// The door draws in colour whatever this process's own stdout is (a container's
// is no terminal) — so colour is forced before ink's colours are first loaded.
const openDoor = async (port: number, socketUrl: string): Promise<{ close: () => Promise<void> }> => {
  process.env['FORCE_COLOR'] ??= '3';
  const { openSshDoor } = await import('./ssh-door');
  const door = await openSshDoor({ port, socketUrl, hostKeyFile: process.env['LYCEUM_SSH_HOST_KEY'] ?? '.lyceum/ssh_host_ed25519_key' });
  console.log(`lyceum's ssh door on port ${door.port}`);
  return door;
};

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

const main = async (): Promise<void> => {
  // Keys (GROQ_API_KEY, TYPESAFE_API_KEY) from apps/lab/lyceum/.env when there
  // is one; a container passes them in its environment instead.
  if (existsSync('.env')) process.loadEnvFile('.env');
  const databaseUrl = process.env['DATABASE_URL'] ?? '';
  if (databaseUrl === '') console.warn('[lyceum] no DATABASE_URL — running on in-memory PGlite; everything is gone on restart.');
  const runtime = databaseUrl === '' ? await devRuntime() : await postgresRuntime(databaseUrl);
  const port = Number(process.env['PORT'] ?? 8796);
  const publicUrl = process.env['PUBLIC_URL'] ?? `http://localhost:${port}`;
  const { server, close } = await bootOn(runtime, { publicUrl });

  mountLogin(server, runtime.pool);
  if (existsSync(dist)) mountSite(server, dist);
  else console.warn(`[lyceum] no ${dist} — serving the app surfaces only; run \`pnpm --filter lyceum build\` for the terminal.`);

  const httpServer = serve({ fetch: server.fetch, port });
  attachSocket(httpServer, server.socket);
  console.log(`lyceum listening on http://localhost:${port}`);

  // The SSH door, when asked for: a terminal host in this process, a client
  // of the socket above like any phone (./ssh-door.ts).
  const sshPort = Number(process.env['LYCEUM_SSH_PORT'] ?? 0);
  const door = sshPort > 0 ? await openDoor(sshPort, `ws://127.0.0.1:${port}/socket`) : undefined;

  const stop = (): void => {
    httpServer.close();
    void Promise.all([close(), door?.close()]).finally(() => process.exit(0));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
