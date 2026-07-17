// The dev checks' world: ONE moss over ONE dev database. `login()` mints a
// dev token via the server-side directory (there is no client auth
// machinery any more) and hands back the SERVER'S OWN living shell for
// that principal — the same durable nova Shell the socket streams — so
// checks drive dispatch/getRuntime against the real thing. `wire` is the
// server's fetch with the current session's Bearer header; `runtime.db` is the
// SQL ground truth (the same database the server writes).
import type { Shell } from '@niscorp/nova';
import { boot } from '../server/boot';
import { mintToken, userByUsername } from '../server/users';

const booted = await boot();
export const runtime = booted.runtime;
export const server = booted.server;

let currentToken: string | null = null;
export const readToken = (): string | null => currentToken;

type Init = { method?: string; headers?: Record<string, string>; body?: string };

export const wire = (url: string, init?: Init): Promise<Response> => {
  return server.request(url, {
    method: init?.method ?? 'GET',
    headers: { ...init?.headers, ...(currentToken !== null ? { Authorization: `Bearer ${currentToken}` } : {}) },
    ...(init?.body !== undefined ? { body: init.body } : {}),
  });
};

export const login = (username: string): Shell => {
  const token = mintToken(username);
  const user = userByUsername(username);
  if (token === null || user === undefined) throw new Error(`check-shell: unknown username "${username}"`);
  currentToken = token;
  const session = server.shells?.session(token, user.id);
  if (session === undefined) throw new Error('check-shell: the app serves no shell');
  return session.shell;
};

export const shell = login('alex');
