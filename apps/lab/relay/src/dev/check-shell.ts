// The dev checks' world: ONE moss over ONE dev database. `await login()` mints a
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

// `async` because `server.request` may answer synchronously — the declared
// `Promise<Response>` was a claim about a union, and every caller awaits anyway.
export const wire = async (url: string, init?: Init): Promise<Response> => {
  return await server.request(url, {
    method: init?.method ?? 'GET',
    headers: { ...init?.headers, ...(currentToken !== null ? { Authorization: `Bearer ${currentToken}` } : {}) },
    ...(init?.body !== undefined ? { body: init.body } : {}),
  });
};

/** The row a check is about — or a loud stop.
 *
 *  `rows()[0]` is `T | undefined`, and a check that reads straight through it is
 *  making a silent bet on the fixture. When the bet is wrong the failure is not
 *  "no rows": it is a cascade of `undefined` reads that ends in a comparison of
 *  two undefineds, which PASSES. Say what was expected instead, once, out loud. */
export const must = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`check-shell: expected ${what}, and the list had none — the fixture moved`);
  return value;
};

export const login = async (username: string): Promise<Shell> => {
  const token = mintToken(username);
  const user = userByUsername(username);
  if (token === null || user === undefined) throw new Error(`check-shell: unknown username "${username}"`);
  currentToken = token;
  const session = await server.shells?.session(token, user.id);
  if (session === undefined) throw new Error('check-shell: the app serves no shell');
  return session.shell;
};

export const shell = await login('alex');
