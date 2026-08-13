import type { Shell } from '@niscorp/nova';
// THE LAB'S SIGN-IN TRANSPORT. Clicking a name is how a nonce reaches the
// browser here, exactly as a mail link is in a deployment. Set before the app
// is built, because `shell.inputs` reads it when it composes the login screen.
process.env['LYRA_DEV_LOGIN'] = 'on';

import { boot, tideDriver } from '@lyra/server/boot';
import { identityFor } from '@lyra/server/identity';
import { resolveCatalogForRoles } from '@niscorp/moss';

const booted = await boot();

export const runtime = booted.runtime;
export const server = booted.server;
export const app = booted.app;
export const tide = booted.tide;
export { tideDriver };


// HOW THE HARNESS ADDRESSES A PERSON.
//
// Every check says "as Omar" and needs an id. That used to come from
// `personByEmail`, a second index over a resident copy of the population — the
// exact shape invariant 2 bans, kept alive by the checks long after the
// application stopped needing it.
//
// One query, at boot, for the check harness only. It is a directory, and it is
// allowed to be: this file IS the dev transport, the same surface the login
// picker is served from, and `held-state-check` excludes `dev/` for this reason.
// The application below it holds nothing.
const ROSTER: Record<string, string> = {};
{
  const rows = await booted.runtime.pool.query('SELECT id, email FROM people');
  for (const row of rows.rows as { id: string; email: string }[]) ROSTER[row.email.trim().toLowerCase()] = row.id;
}

/** The principal behind an address — the harness's whole addressing scheme. */
import { mintToken as mintFor } from '@lyra/server/tokens';

/** The lab's credential for an address. Bound to the harness pool so a check
 *  says `mintToken(email)` and nothing else. */
export const mintToken = async (email: string): Promise<string | null> => mintFor(booted.runtime.pool, email);

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

export const login = async (email: string): Promise<Shell> => (await sessionFor(email)).shell;

/** The anonymous principal's shell — what somebody with no credential is served. */
export const anonymous = async (): Promise<Shell> => {
  const session = await server.shells?.session(null, null);
  if (session === undefined) throw new Error('world: the app serves no shell');
  return session.shell;
};


// THE CATALOG A PERSON HOLDS — resolved the way production resolves it.
//
// Checks used to call `resolveCatalog(app, id)`, which read roles out of the
// assignment map. There is no map: roles come from the identity seam, one
// principal at a time. So the harness asks the same seam the request path asks,
// which is also the point — a check resolving by a route production does not
// take is a check asserting about a deployment nobody runs.
export const idsFor = async (email: string | null): Promise<readonly string[]> => {
  if (email === null) return resolveCatalogForRoles(app, ['public'], undefined).ids;
  const record = await identityFor(booted.runtime.pool, idFor(email), () => undefined);
  return resolveCatalogForRoles(app, record.roles, record.installed).ids;
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

/** The WHOLE envelope, not just `result` — `meta.context` is the parameter
 *  contract a caller reads to learn what a fingerprint accepts, and
 *  `meta.missingContext` is how it learns what it forgot. Neither is visible
 *  through `asPrincipal`, which unwraps to the rows on purpose. */
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

// The tick and the cross live in `assert.ts` — a surface check needs them
// without needing a database. Re-exported so every check that already reaches
// for them here keeps working.
export { ok, report } from './assert';
