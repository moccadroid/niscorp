// THE HEADLESS TERMINAL every check drives — a real websocket against the real
// boot, reading trees as a terminal would. Shared so each check says only
// what it asserts.
import { z } from 'zod';

export const results: { label: string; ok: boolean }[] = [];
export const check = (label: string, ok: boolean): void => {
  results.push({ label, ok });
  console.log(`${ok ? '[pass]' : '[fail]'} ${label}`);
};

const MessageSchema = z.looseObject({ type: z.string() });
const HelloSchema = z.object({ type: z.literal('hello'), principal: z.string().nullable(), catalog: z.object({ actions: z.array(z.string()) }) });
const SessionSchema = z.object({ type: z.literal('session'), token: z.string() });
const RenderSchema = z.object({ type: z.literal('render'), canvas: z.string(), tree: z.unknown() });

export type Terminal = {
  hello: () => Promise<z.infer<typeof HelloSchema>>;
  // Resolves when the newest tree on `canvas` contains `text`.
  shows: (canvas: string, text: string) => Promise<boolean>;
  showsNow: (canvas: string, text: string) => boolean;
  textOf: (canvas: string) => string;
  session: () => Promise<string>;
  click: (canvas: string, ref: string, payload?: unknown) => void;
  // A click on `ref` inside the one instance on `canvas` that shows `text` —
  // for a list canvas whose instances share a ref (the phone's tabs).
  clickIn: (canvas: string, ref: string, text: string) => void;
  // What a `model`'d field sends as somebody types (nova's dom adapter).
  type: (canvas: string, ref: string, text: string) => void;
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

// WHICH INSTANCE A CLICK BELONGS TO — decided where a terminal decides it: the
// served tree's ActionSlot around the pressed node. On a list canvas several
// instances are live at once, and a click on any but the last must say which
// (nova's dom adapter and moss's react terminal both stamp it the same way).
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

// The `value` prop of the first node carrying `ref` — a click's payload.
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

// The ActionSlot on a canvas whose subtree shows `text` — which instance a
// click on a shared ref means.
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
    const socket = new WebSocket(`${base}/socket${token === undefined ? '' : `?token=${encodeURIComponent(token)}`}`);
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
          // What a real click sends: the pressed node's own `value`, unless the
          // check says otherwise (nova's dom adapter).
          const sent = payload === undefined ? valueOf(tree, ref) : payload;
          const event = { type: 'ui:click', ref, ...(sent === undefined ? {} : { payload: sent }), ...(origin === undefined ? {} : { origin }) };
          socket.send(JSON.stringify({ type: 'event', canvas, event }));
        },
        clickIn: (canvas, ref, text) => {
          const origin = instanceShowing(JSON.parse(trees.get(canvas) ?? '[]'), text);
          socket.send(JSON.stringify({ type: 'event', canvas, event: { type: 'ui:click', ref, ...(origin === undefined ? {} : { origin }) } }));
        },
        type: (canvas, ref, text) => {
          const origin = instanceAround(JSON.parse(trees.get(canvas) ?? '[]'), ref);
          const event = { type: 'ui:model', ref, payload: text, ...(origin === undefined ? {} : { origin }) };
          socket.send(JSON.stringify({ type: 'event', canvas, event }));
        },
        sessionsSeen: () => sessions.length,
        isOpen: () => open,
        close: () => socket.close(),
      });
    });
  });

// One line per check, and the exit code the suite reads.
export const finish = (): never => {
  const failed = results.filter((result) => !result.ok).length;
  console.log(failed === 0 ? `OK — ${results.length} assertions` : `FAIL — ${failed} of ${results.length} assertions`);
  process.exit(failed === 0 ? 0 : 1);
};
