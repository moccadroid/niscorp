import type { Shell } from '@niscorp/nova';
import './no-llm'; // must run before boot loads .env
import { startIntegrationsService } from '@atrium/integrations/service';
import { boot } from '@atrium/server/boot';
import { mintToken, userByUsername } from '@atrium/server/users';

// The integrations service starts before boot: boot's discovery sync pulls
// every bundle from it, and with no listener the world boots core-only.
export const integrations = await startIntegrationsService();
const booted = await boot();
export const runtime = booted.runtime;
export const server = booted.server;
export const app = booted.app;

// For a check that crosses a reset: the reset builds a new shell, and the
// session is what follows it.
export const sessionFor = async (username: string): Promise<Awaited<ReturnType<NonNullable<typeof server.shells>['session']>>> => {
  const token = mintToken(username);
  const user = userByUsername(username);
  if (token === null || user === undefined) throw new Error(`world: unknown username "${username}"`);
  const session = await server.shells?.session(token, user.id);
  if (session === undefined) throw new Error('world: the app serves no shell');
  return session;
};

export const login = async (username: string): Promise<Shell> => (await sessionFor(username)).shell;

// A mount fires an endpoint whose onSuccess fires another; the ticks wait for
// the whole chain.
export const settle = async (ticks = 6): Promise<void> => {
  for (let i = 0; i < ticks; i++) await new Promise((r) => setTimeout(r, 30));
};

export const mounted = (shell: Shell, canvas: string): string[] => {
  const state = shell.getState().canvases[canvas];
  return state === undefined ? [] : state.stack.map((i) => i.definitionId);
};

export const topData = (shell: Shell, canvas: string): Record<string, unknown> => {
  const active = shell.getState().canvases[canvas]?.active;
  if (active === undefined) return {};
  return shell.getRuntime(active.id)?.getData() ?? {};
};

const COMPOSED = ['nav', 'home', 'work', 'detail', 'rail', 'aside'];

export const cardOf = (shell: Shell, definitionId: string, canvas?: string): string => {
  const state = shell.getState();
  for (const id of canvas === undefined ? COMPOSED : [canvas]) {
    const found = (state.canvases[id]?.stack ?? []).find((i) => i.definitionId === definitionId);
    if (found !== undefined) return found.id;
  }
  throw new Error(`world: no "${definitionId}" card on ${canvas ?? COMPOSED.join('/')}`);
};

export const cardData = (shell: Shell, definitionId: string, canvas?: string): Record<string, unknown> =>
  shell.getRuntime(cardOf(shell, definitionId, canvas))?.getData() ?? {};

export const tapCard = (shell: Shell, definitionId: string, ref: string, payload?: unknown, canvas?: string, type = 'ui:click'): void => {
  shell.dispatch({ type, ref, ...(payload !== undefined ? { payload } : {}), origin: cardOf(shell, definitionId, canvas) } as Parameters<Shell['dispatch']>[0]);
};

export const openCard = async (shell: Shell, definitionId: string, canvas?: string): Promise<void> => {
  tapCard(shell, definitionId, 'expand', undefined, canvas);
  await settle();
};

export const openFromMenu = async (shell: Shell, definitionId: string): Promise<void> => {
  const already = (shell.getState().canvases['work']?.stack ?? []).find((item) => item.definitionId === definitionId);
  if (already !== undefined) {
    shell.popTo('work', already.id);
    await settle(8);
    return;
  }
  const menu = cardOf(shell, 'staff.menu', 'nav');
  const entries = (shell.getRuntime(menu)?.getData()['entries'] ?? []) as Record<string, unknown>[];
  const entry = (Array.isArray(entries) ? entries : []).find((row) => row['action_id'] === definitionId);
  if (entry === undefined) throw new Error(`world: the menu offers no "${definitionId}" (has ${entries.map((r) => String(r['action_id'])).join(', ') || 'nothing'})`);
  shell.dispatch({ type: 'ui:click', ref: 'open', payload: entry, origin: menu } as Parameters<Shell['dispatch']>[0]);
  await settle(8);
};

export const menuIds = (shell: Shell): string[] => {
  const menu = cardOf(shell, 'staff.menu', 'nav');
  const entries = (shell.getRuntime(menu)?.getData()['entries'] ?? []) as Record<string, unknown>[];
  return (Array.isArray(entries) ? entries : []).map((row) => String(row['action_id']));
};

export const composed = (shell: Shell): string[] => {
  const state = shell.getState();
  return COMPOSED.filter((id) => id !== 'aside').flatMap((id) => (state.canvases[id]?.stack ?? []).map((i) => i.definitionId));
};

export const sql = async (text: string, values: unknown[] = []): Promise<Record<string, unknown>[]> => {
  const result = await runtime.pool.query(text, values);
  return result.rows;
};

const results: [string, boolean][] = [];

export const check = (label: string, pass: boolean): void => {
  results.push([label, pass]);
  console.log(`${pass ? '✓' : '✗'} ${label}`);
};

export const report = (title: string): void => {
  const failed = results.filter(([, ok]) => !ok).length;
  console.log(failed === 0 ? `\nOK — ${title} (${results.length} assertions)` : `\nFAIL — ${failed} of ${results.length} assertions failed in ${title}`);
  process.exit(failed === 0 ? 0 : 1);
};

export const tap = (shell: Shell, canvas: string, ref: string, payload?: unknown, type = 'ui:click'): void => {
  const active = shell.getState().canvases[canvas]?.active;
  shell.dispatch({ type, ref, ...(payload !== undefined ? { payload } : {}), ...(active !== undefined ? { origin: active.id } : {}) } as Parameters<Shell['dispatch']>[0]);
};

export const catalogFor = async (username: string): Promise<readonly string[]> => {
  const user = userByUsername(username);
  if (user === undefined) throw new Error(`world: unknown username "${username}"`);
  return (await server.catalogOf(user.id)).ids;
};

export const asPrincipal = async (username: string, path: string, body: unknown): Promise<unknown> => {
  const token = mintToken(username);
  if (token === null) throw new Error(`world: unknown username "${username}"`);
  const res = await server.request(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { result?: unknown };
  return json.result;
};
