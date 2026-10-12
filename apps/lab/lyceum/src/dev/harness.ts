import { z } from 'zod';
import { mintSession } from '@niscorp/moss';
import { offerToken, PROTOCOL } from '@niscorp/moss/protocol';
import type { MossServer } from '@niscorp/moss';
import type { PgPool } from '@niscorp/vex';
import { assistantGive, EVERYBODY } from '@lyceum/app/vex/grant.entries';
import { memberRegister } from '@lyceum/app/vex/member.entries';

export const giveAssistant = async (server: MossServer, pool: PgPool): Promise<void> => {
  const token = await mintSession(pool, 'speaker', 60_000);
  const replay = async (fingerprint: string, context: Record<string, unknown>): Promise<unknown> => {
    const response = await server.request('/api/vex', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ fingerprint, context }) });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(`${fingerprint}: ${JSON.stringify(body)}`);
    return typeof body === 'object' && body !== null && 'result' in body ? body.result : body;
  };
  await replay(assistantGive.fingerprint, { to: EVERYBODY });
};

export const results: { label: string; ok: boolean }[] = [];
export const check = (label: string, ok: boolean): void => {
  results.push({ label, ok });
  console.log(`${ok ? '[pass]' : '[fail]'} ${label}`);
};

const MessageSchema = z.looseObject({ type: z.string() });
const HelloSchema = z.object({ type: z.literal('hello'), principal: z.string().nullable(), catalog: z.object({ actions: z.array(z.string()) }) });
const SessionSchema = z.object({ type: z.literal('session'), token: z.string() });
const RenderSchema = z.object({ type: z.literal('render'), canvas: z.string(), tree: z.unknown() });
const FrameSchema = z.object({ type: z.literal('frame'), tree: z.unknown() });

export type Terminal = {
  hello: () => Promise<z.infer<typeof HelloSchema>>;
  shows: (canvas: string, text: string) => Promise<boolean>;
  showsNow: (canvas: string, text: string) => boolean;
  textOf: (canvas: string) => string;
  session: () => Promise<string>;
  click: (canvas: string, ref: string, payload?: unknown) => void;
  publish: (channel: string, payload?: unknown) => void;
  clickIn: (canvas: string, ref: string, text: string) => void;
  type: (canvas: string, ref: string, text: string) => void;
  key: (canvas: string, ref: string, key: string) => void;
  sessionsSeen: () => number;
  isOpen: () => boolean;
  close: () => void;
};

const WAIT_MS = 8000;

export const waitUntil = async (condition: () => boolean): Promise<boolean> => {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return condition();
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const instanceAround = (nodes: unknown, ref: string, inside?: string): string | undefined => {
  if (!Array.isArray(nodes)) return undefined;
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    const props = isRecord(node['props']) ? node['props'] : {};
    const here = node['name'] === 'ActionSlot' && typeof props['instanceId'] === 'string' ? props['instanceId'] : inside;
    if (node['ref'] === ref) return here;
    const found = instanceAround(node['children'], ref, here);
    if (found !== undefined) return found;
  }
  return undefined;
};

const valueOf = (nodes: unknown, ref: string): unknown => {
  if (!Array.isArray(nodes)) return undefined;
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    if (node['ref'] === ref) return isRecord(node['props']) ? node['props']['value'] : undefined;
    const found = valueOf(node['children'], ref);
    if (found !== undefined) return found;
  }
  return undefined;
};

const instanceShowing = (nodes: unknown, text: string): string | undefined => {
  if (!Array.isArray(nodes)) return undefined;
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    const props = isRecord(node['props']) ? node['props'] : {};
    if (node['name'] === 'ActionSlot' && typeof props['instanceId'] === 'string' && JSON.stringify(node).includes(text)) return props['instanceId'];
    const found = instanceShowing(node['children'], text);
    if (found !== undefined) return found;
  }
  return undefined;
};

export const connect = (base: string, token?: string): Promise<Terminal> =>
  new Promise((resolveTerminal, reject) => {
    const socket = new WebSocket(`${base}/socket?protocol=${PROTOCOL}`, offerToken(token ?? null));
    const trees = new Map<string, string>();
    let hello: z.infer<typeof HelloSchema> | undefined;
    const sessions: string[] = [];
    let open = false;

    socket.addEventListener('message', (event) => {
      const message = MessageSchema.parse(JSON.parse(String(event.data)));
      const asHello = HelloSchema.safeParse(message);
      if (asHello.success) hello = asHello.data;
      const asSession = SessionSchema.safeParse(message);
      if (asSession.success) sessions.push(asSession.data.token);
      const asRender = RenderSchema.safeParse(message);
      if (asRender.success) trees.set(asRender.data.canvas, JSON.stringify(asRender.data.tree));
      const asFrame = FrameSchema.safeParse(message);
      if (asFrame.success) trees.set('frame', JSON.stringify(asFrame.data.tree));
    });
    socket.addEventListener('close', () => {
      open = false;
    });
    socket.addEventListener('error', () => reject(new Error('socket error')));
    socket.addEventListener('open', () => {
      open = true;
      resolveTerminal({
        hello: async () => {
          await waitUntil(() => hello !== undefined);
          if (hello === undefined) throw new Error('no hello');
          return hello;
        },
        shows: (canvas, text) => waitUntil(() => (trees.get(canvas) ?? '').includes(text)),
        showsNow: (canvas, text) => (trees.get(canvas) ?? '').includes(text),
        textOf: (canvas) => trees.get(canvas) ?? '',
        session: async () => {
          await waitUntil(() => sessions.length > 0);
          const [first] = sessions;
          if (first === undefined) throw new Error('no session granted');
          return first;
        },
        click: (canvas, ref, payload) => {
          const tree: unknown = JSON.parse(trees.get(canvas) ?? '[]');
          const origin = instanceAround(tree, ref);
          const sent = payload === undefined ? valueOf(tree, ref) : payload;
          const event = { type: 'ui:click', ref, ...(sent === undefined ? {} : { payload: sent }), ...(origin === undefined ? {} : { origin }) };
          socket.send(JSON.stringify({ type: 'event', canvas, event }));
        },
        publish: (channel, payload) => socket.send(JSON.stringify(payload === undefined ? { type: 'publish', channel } : { type: 'publish', channel, payload })),
        clickIn: (canvas, ref, text) => {
          const origin = instanceShowing(JSON.parse(trees.get(canvas) ?? '[]'), text);
          socket.send(JSON.stringify({ type: 'event', canvas, event: { type: 'ui:click', ref, ...(origin === undefined ? {} : { origin }) } }));
        },
        type: (canvas, ref, text) => {
          const origin = instanceAround(JSON.parse(trees.get(canvas) ?? '[]'), ref);
          const event = { type: 'ui:model', ref, payload: text, ...(origin === undefined ? {} : { origin }) };
          socket.send(JSON.stringify({ type: 'event', canvas, event }));
        },
        key: (canvas, ref, key) => {
          const origin = instanceAround(JSON.parse(trees.get(canvas) ?? '[]'), ref);
          socket.send(JSON.stringify({ type: 'event', canvas, event: { type: 'ui:key', ref, key, ...(origin === undefined ? {} : { origin }) } }));
        },
        sessionsSeen: () => sessions.length,
        isOpen: () => open,
        close: () => socket.close(),
      });
    });
  });

export const finish = (): never => {
  const failed = results.filter((result) => !result.ok).length;
  console.log(failed === 0 ? `OK — ${results.length} assertions` : `FAIL — ${failed} of ${results.length} assertions`);
  process.exit(failed === 0 ? 0 : 1);
};
