// The checks' shared world: one booted app, in-process, no port.
//
// `createServer` with a dev runtime is the SAME composition vite runs and the
// same one `serve.ts` runs — a check that booted something else would be
// asserting about a thing nobody ships.
import type { Shell } from '@niscorp/nova';
import { boot } from '@lyra/server/boot';
import { mintToken, personByEmail } from '@lyra/server/users';

const booted = await boot();

export const runtime = booted.runtime;
export const server = booted.server;
export const app = booted.app;

// The session, not the shell — for a check that outlives a reset. `login` hands
// back `session.shell`, which is the right thing to drive and the wrong thing
// to hold across a reset.
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

// Mount fires an endpoint whose onSuccess fires another; a check has to await
// the whole chain, not the first promise.
export const settle = async (turns = 6): Promise<void> => {
  for (let i = 0; i < turns; i += 1) await new Promise((resolve) => setTimeout(resolve, 12));
};

// A request AS somebody, over the server's own HTTP surface — the same one a
// browser hits and the same one curl hits. This is how a scope claim gets
// tested honestly: not by reading a layout, which only proves today's layout
// leaks nothing, but by asking the wire the question directly.
//
// Returns `{ status }` on a refusal so a check can assert that a request was
// REFUSED rather than quietly empty. The two are very different answers and a
// helper that flattened them would hide the more interesting one.
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

// THE RENDERED TREE — what a terminal would actually paint, frame included:
// CanvasSlot markers resolved into their canvases, ActionSlot markers kept so
// instance identity survives. This is the only honest thing to assert on;
// `snapshotShell` reports structure (which instances are mounted) and carries
// no text at all, which is a mistake worth making exactly once.
export const treeOf = (shell: Shell): string => JSON.stringify(shell.flattenRenderTree(shell.getShellRenderTree()));

let failed = 0;
export const ok = (label: string, condition: boolean, detail = ''): void => {
  console.log(`${condition ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${label}${detail === '' ? '' : ` — ${detail}`}`);
  if (!condition) failed += 1;
};

export const report = (what: string): never => {
  console.log(failed === 0 ? `\n\x1b[32mOK — ${what}\x1b[0m` : `\n\x1b[31mFAIL — ${failed} assertion(s).\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
};
