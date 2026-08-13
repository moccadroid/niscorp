import type { Shell } from '@niscorp/nova';
import { boot, tideDriver } from '@lyra/server/boot';
import { mintToken, personByEmail } from '@lyra/server/users';

const booted = await boot();

export const runtime = booted.runtime;
export const server = booted.server;
export const app = booted.app;
export const tide = booted.tide;
export { tideDriver };


export const sessionFor = (email: string): NonNullable<ReturnType<NonNullable<typeof server.shells>['session']>> => {
  const token = mintToken(email);
  const person = personByEmail(email);
  if (token === null || person === undefined) throw new Error(`world: unknown email "${email}"`);
  const session = server.shells?.session(token, person.id);
  if (session === undefined) throw new Error('world: the app serves no shell');
  return session;
};

export const login = (email: string): Shell => sessionFor(email).shell;

/** The anonymous principal's shell — what somebody with no credential is served. */
export const anonymous = (): Shell => {
  const session = server.shells?.session(null, null);
  if (session === undefined) throw new Error('world: the app serves no shell');
  return session.shell;
};

export const settle = async (turns = 6): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await new Promise((resolve) => setTimeout(resolve, 12));
};

export const asPrincipal = async (email: string, path: string, body: unknown): Promise<unknown> => {
  const token = mintToken(email);
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

export const treeOf = (shell: Shell): string => JSON.stringify(shell.flattenRenderTree(shell.getShellRenderTree()));

/** EVERYTHING A TERMINAL IS ACTUALLY SENT, as one string.
 *
 *  `treeOf` reads the shell directly, which is right for structure and WRONG
 *  for anything moss does on the way out — the language pass, in particular,
 *  runs between flatten and serialize (`shells.ts`), so a tree read from nova
 *  is always in the source language no matter what the principal reads in.
 *
 *  This attaches a real connection and keeps what comes down it, which is the
 *  only honest answer to "what does this person see". */
export const servedTo = (email: string): string => {
  const session = sessionFor(email);
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

// The tick and the cross live in `assert.ts` — a surface check needs them
// without needing a database. Re-exported so every check that already reaches
// for them here keeps working.
export { ok, report } from './assert';
