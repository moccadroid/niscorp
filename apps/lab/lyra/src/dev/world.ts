import type { Shell } from '@niscorp/nova';
import { unverifiedShell } from '@niscorp/moss/unverified';
// Set before `boot()`: `shell.inputs` reads it when it composes the login screen.
process.env['LYRA_DEV_LOGIN'] = 'on';

import { boot, tideDriver } from '@lyra/server/boot';

const booted = await boot();

export const runtime = booted.runtime;
export const server = booted.server;
export const app = booted.app;
export const tide = booted.tide;
export { tideDriver };


const ROSTER: Record<string, string> = {};
{
  const rows = await booted.runtime.pool.query('SELECT id, email FROM people WHERE email IS NOT NULL');
  for (const row of rows.rows as { id: string; email: string }[]) ROSTER[row.email.trim().toLowerCase()] = row.id;
}

import { mintToken as mintFor } from '@lyra/server/tokens';

export const mintToken = async (email: string): Promise<string | null> => mintFor(server.executeAs, email);

export const idFor = (email: string): string => {
  const id = ROSTER[email.trim().toLowerCase()];
  if (id === undefined) throw new Error(`world: unknown email "${email}"`);
  return id;
};

export const sessionFor = async (email: string): Promise<Awaited<ReturnType<NonNullable<typeof server.shells>['session']>>> => {
  const token = await mintToken(email);
  if (token === null) throw new Error(`world: unknown email "${email}"`);
  const session = await server.shells?.session(token, idFor(email));
  if (session === undefined) throw new Error('world: the app serves no shell');
  return session;
};

export const login = async (email: string): Promise<Shell> => unverifiedShell(await sessionFor(email));

export const anonymous = async (): Promise<Shell> => {
  const session = await server.shells?.session(null, null);
  if (session === undefined) throw new Error('world: the app serves no shell');
  return unverifiedShell(session);
};


export const idsFor = async (email: string | null): Promise<readonly string[]> => (await server.catalogOf(email === null ? null : idFor(email))).ids;


export const wireFor = (email: string): import('@niscorp/nova').FetchFn => async (url, init) => {
  const token = await mintToken(email);
  const res = await server.request(url, {
    method: init?.method ?? 'GET',
    headers: { ...(init?.headers ?? {}), ...(token !== null ? { Authorization: `Bearer ${token}` } : {}) },
    ...(init?.body !== undefined ? { body: init.body } : {}),
  });
  if (!url.split('?')[0]?.endsWith('/vex') || !res.ok) return res;
  const body = (await res.json()) as Record<string, unknown> | null;
  const result = body !== null && typeof body === 'object' && 'result' in body ? body['result'] : body;
  return { ok: res.ok, status: res.status, json: () => Promise.resolve(result), text: () => Promise.resolve(JSON.stringify(result)) } as unknown as Response;
};

export const settle = async (turns = 6): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await new Promise((resolve) => setTimeout(resolve, 12));
};

export const asPrincipal = async (email: string, path: string, body: unknown): Promise<unknown> => {
  const token = await mintToken(email);
  if (token === null) throw new Error(`world: unknown email "${email}"`);
  const response = await server.request(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { status: response.status };
  const json: { result?: unknown } = await response.json();
  return json.result;
};

export const envelopeOf = async (email: string, path: string, body: unknown): Promise<Record<string, unknown>> => {
  const token = await mintToken(email);
  if (token === null) throw new Error(`world: unknown email "${email}"`);
  const response = await server.request(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { status: response.status };
  return await response.json() as Record<string, unknown>;
};

// Read with the phrase book off: a shell renders in its reader's language, and
// a check spells its probes in the source language.
export const treeOf = (shell: Shell): string => {
  // Setting the phrases goes around moss, so it takes the whole shell.
  const whole = unverifiedShell({ shell });
  const held = whole.getPhrases();
  whole.setPhrases(undefined);
  try {
    return JSON.stringify(whole.flattenRenderTree(whole.getShellRenderTree()));
  } finally {
    whole.setPhrases(held);
  }
};

export const servedTo = async (email: string): Promise<string> => {
  const session = await sessionFor(email);
  const sent: string[] = [];
  const connection = {
    send: (text: string) => sent.push(text),
    close: () => undefined,
    onMessage: () => undefined,
    onClose: () => undefined,
  };
  session.attach(connection);
  session.detach(connection);
  return sent.join('\n');
};

export { ok, report } from './assert';
