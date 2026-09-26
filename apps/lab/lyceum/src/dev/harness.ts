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
  session: () => Promise<string>;
  click: (canvas: string, ref: string) => void;
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
        session: async () => {
          await waitUntil(() => sessions.length > 0);
          const [first] = sessions;
          if (first === undefined) throw new Error('no session granted');
          return first;
        },
        click: (canvas, ref) => socket.send(JSON.stringify({ type: 'event', canvas, event: { type: 'ui:click', ref } })),
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
