import type { Shell } from '@niscorp/nova';
import './no-llm'; // must run before boot loads .env — the suite is keyless by design
import { resolveCatalog } from '@niscorp/moss';
import { startIntegrationsService } from '@atrium/integrations/service';
import { boot } from '@atrium/server/boot';
import { mintToken, userByUsername } from '@atrium/server/users';

// The checks' world: ONE moss over ONE dev database. `login()` hands back the
// SERVER'S OWN living shell for a principal — the same durable nova Shell the
// socket streams — so a check drives the real thing rather than a replica.
//
// `runtime.db` is the SQL ground truth: the same database the server writes.
// `app` is the composed manifest boot built — the synced bundles included —
// so `catalogFor` resolves over what the server actually serves.
//
// The integrations service starts FIRST, on the hermetic port no-llm set:
// boot's discovery sync pulls every bundle from it, and without a listener
// the world would boot core-only. Exported so a check can stop it —
// integrations-check proves the down-phase by closing exactly this handle.
export const integrations = await startIntegrationsService();
const booted = await boot();
export const runtime = booted.runtime;
export const server = booted.server;
export const app = booted.app;

// The session, not the shell — for a check that outlives a RESET. `login`
// hands back `session.shell`, which is the right thing to drive and the wrong
// thing to hold across a reset: the reset builds a new shell and the session is
// what follows it. Everything that never resets can keep using `login`.
export const sessionFor = (username: string): NonNullable<ReturnType<NonNullable<typeof server.shells>['session']>> => {
  const token = mintToken(username);
  const user = userByUsername(username);
  if (token === null || user === undefined) throw new Error(`world: unknown username "${username}"`);
  const session = server.shells?.session(token, user.id);
  if (session === undefined) throw new Error('world: the app serves no shell');
  return session;
};

export const login = (username: string): Shell => sessionFor(username).shell;

// Give the shell's mount chain time to settle. Mount fires an endpoint, whose
// onSuccess fires another — a check has to await the whole chain, not the first
// promise.
export const settle = async (ticks = 6): Promise<void> => {
  for (let i = 0; i < ticks; i++) await new Promise((r) => setTimeout(r, 30));
};

// Every action id currently mounted on a canvas, in stack order.
export const mounted = (shell: Shell, canvas: string): string[] => {
  const state = shell.getState().canvases[canvas];
  return state === undefined ? [] : state.stack.map((i) => i.definitionId);
};

// The data of the action on top of a canvas.
export const topData = (shell: Shell, canvas: string): Record<string, unknown> => {
  const active = shell.getState().canvases[canvas]?.active;
  if (active === undefined) return {};
  return shell.getRuntime(active.id)?.getData() ?? {};
};

// ─── driving a COMPOSED surface ──────────────────────────────
// The crew's application is a list of live cards on `home`, not a screen the
// chrome navigates to, so a check reaches a surface by finding its card. These
// three are the composed-canvas twins of `topData`/`tap`: identity is the
// INSTANCE, because a list canvas holds many live at once and an event without
// the right origin lands on the wrong one.

// The canvases a composed surface can land on. A person does not know or care
// which column a card is in, so neither do these: given no canvas, they find
// the card wherever it was composed. Pass one only to ASSERT the placement.
const COMPOSED = ['nav', 'home', 'work', 'detail', 'rail', 'aside'];

// The instance id of a live card, by the action it renders.
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

// Tap something INSIDE a card — the browser stamps the card's instance as the
// event origin (the served ActionSlot does it), so a check must too.
export const tapCard = (shell: Shell, definitionId: string, ref: string, payload?: unknown, canvas?: string, type = 'ui:click'): void => {
  shell.dispatch({ type, ref, ...(payload !== undefined ? { payload } : {}), origin: cardOf(shell, definitionId, canvas) } as Parameters<Shell['dispatch']>[0]);
};

// Open a card: the same tap a person makes on the collapsed preview.
export const openCard = async (shell: Shell, definitionId: string, canvas?: string): Promise<void> => {
  tapCard(shell, definitionId, 'expand', undefined, canvas);
  await settle();
};

// ─── opening a WORKING surface, the way a clerk now does ─────
// Nothing is seeded onto `work` any more: it is a stack, and a staff surface is
// reached from the menu (or from a tile, or by a push). So a check cannot expand
// a card that was never placed — it has to go through the same door.
//
// The payload is the resolved menu ROW, exactly as the layout hands it over, so
// this drives the real target resolution rather than naming an action id the
// menu might not offer.
export const openFromMenu = async (shell: Shell, definitionId: string): Promise<void> => {
  // Already open? Navigate BACK to it rather than stacking a second copy —
  // `popTo` resumes it, and resume re-runs mount, so the surface is current.
  // That is what a person does, and it keeps one instance per surface.
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

// What the staff menu OFFERS — the resolved surfaces this principal can open.
// For a staff audience this is the equivalent of what `composed()` used to
// answer: the same rows, reached through a door instead of unfolded in place.
export const menuIds = (shell: Shell): string[] => {
  const menu = cardOf(shell, 'staff.menu', 'nav');
  const entries = (shell.getRuntime(menu)?.getData()['entries'] ?? []) as Record<string, unknown>[];
  return (Array.isArray(entries) ? entries : []).map((row) => String(row['action_id']));
};

// Everything composed onto this principal's screen, whichever canvas it sits
// on — the crew's working surface is three stacks the frame arranges, and
// "what do they have" is the union.
export const composed = (shell: Shell): string[] => {
  const state = shell.getState();
  return COMPOSED.filter((id) => id !== 'aside').flatMap((id) => (state.canvases[id]?.stack ?? []).map((i) => i.definitionId));
};

export const sql = async (text: string, values: unknown[] = []): Promise<Record<string, unknown>[]> => {
  const result = await runtime.pool.query(text, values);
  return result.rows;
};

// ─── the reporter ────────────────────────────────────────────
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

// Dispatch an event the way the socket does: stamped with the canvas's ACTIVE
// instance as origin, so nova's own origin filter delivers it to that
// instance's triggers alone. A check that skips this is not driving the shell
// a terminal drives.
export const tap = (shell: Shell, canvas: string, ref: string, payload?: unknown, type = 'ui:click'): void => {
  const active = shell.getState().canvases[canvas]?.active;
  shell.dispatch({ type, ref, ...(payload !== undefined ? { payload } : {}), ...(active !== undefined ? { origin: active.id } : {}) } as Parameters<Shell['dispatch']>[0]);
};

// Ring 1, from the horse's mouth: the action ids moss resolved for a principal.
// A check must ask the same resolver the server asks — poking at the shell for a
// definition proves nothing, because an ungranted action was never in it.
export const catalogFor = (username: string): readonly string[] => {
  const user = userByUsername(username);
  if (user === undefined) throw new Error(`world: unknown username "${username}"`);
  return resolveCatalog(app, user.id).ids;
};

// A request to the real vex surface as a given principal — the same path a
// browser (or a curl) takes, Bearer token and all. This is how a check proves
// engine-side scope: it hand-crafts the request body a client could send.
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
