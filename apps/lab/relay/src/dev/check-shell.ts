import type { Shell } from '@niscorp/nova';
import { boot } from '../server/boot';
import { mintToken, userByUsername } from '../server/users';
import { unverifiedShell } from '@niscorp/moss/unverified';

const booted = await boot();
export const runtime = booted.runtime;
export const server = booted.server;

let currentToken: string | null = null;
export const readToken = (): string | null => currentToken;

type Init = { method?: string; headers?: Record<string, string>; body?: string };

// `async` because `server.request` may answer synchronously.
export const wire = async (url: string, init?: Init): Promise<Response> => {
  return await server.request(url, {
    method: init?.method ?? 'GET',
    headers: { ...init?.headers, ...(currentToken !== null ? { Authorization: `Bearer ${currentToken}` } : {}) },
    ...(init?.body !== undefined ? { body: init.body } : {}),
  });
};

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
  return unverifiedShell(session);
};

export const shell = await login('alex');
