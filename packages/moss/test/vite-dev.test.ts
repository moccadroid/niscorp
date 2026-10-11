import { describe, it, expect, afterAll, vi } from 'vitest';
import { createServer as createHttp } from 'node:http';
import type { Server } from 'node:http';
import type { ViteDevServer } from 'vite';
import { WebSocket } from 'ws';
import { mossDev } from '../src/server/vite';
import type { DevApp } from '../src/server/vite';
import type { MossServer } from '../src/server';
import type { SocketAccept } from '../src/socket';

// The dev plugin, driven through what it registers on vite — vite itself is a
// stand-in: the middleware it was given, the watcher it listens to, and (for
// the socket) a real listener on a loopback port in the place of vite's own.
type Middleware = (req: unknown, res: unknown, next: () => void) => void;
type StandIn = { middleware: () => Middleware | undefined; edit: (file: string) => void; said: string[] };

const standIn = (app: () => Promise<DevApp>, httpServer: Server | null = null): StandIn => {
  let middleware: Middleware | undefined;
  const watching: ((file: string) => void)[] = [];
  const said: string[] = [];
  const vite = {
    config: { logger: { error: (line: string) => void said.push(line), info: (line: string) => void said.push(line) }, root: '.' },
    httpServer,
    watcher: { on: (_event: string, fn: (file: string) => void) => void watching.push(fn) },
    ws: { send: () => {} },
    middlewares: { use: (fn: Middleware) => void (middleware = fn) },
    ssrLoadModule: async () => ({}),
  } as unknown as ViteDevServer;
  (mossDev({ app }).configureServer as (server: ViteDevServer) => void)(vite);
  // one watcher is enough to say a file changed: the plugin debounces them
  return { middleware: () => middleware, edit: (file) => watching[0]?.(file), said };
};

// An app's server, as far as the plugin uses it.
const serverOf = (parts: { socket?: SocketAccept }): MossServer => ({ fetch: async () => new Response('app'), close: () => {}, ...parts }) as unknown as MossServer;

// The dev server's own sign-in (`/dev/as/<who>`).
const signInAt = async (who: string, headers: Record<string, string>, tokenKey?: string): Promise<{ status: number; headers: Record<string, string | string[]>; body: string; passedOn: boolean }> => {
  const { middleware } = standIn(async () => ({
    server: serverOf({}),
    signIn: (name: string) => (name === 'ada' ? 'st_abc' : null),
    ...(tokenKey !== undefined ? { tokenKey } : {}),
  }));
  return new Promise((resolve) => {
    const answered: { status: number; headers: Record<string, string | string[]> } = { status: 200, headers: {} };
    const res = {
      set statusCode(code: number) {
        answered.status = code;
      },
      setHeader: (name: string, value: string | string[]) => void (answered.headers[name] = value),
      end: (body?: string) => resolve({ ...answered, body: body ?? '', passedOn: false }),
    };
    middleware()?.({ url: `/dev/as/${who}`, headers, socket: {} }, res, () => resolve({ ...answered, body: '', passedOn: true }));
  });
};

describe('the dev server’s sign-in', () => {
  it('puts the session in the browser’s own cookie — named for the port the dev server is on — and sends the page on, handed nothing', async () => {
    const answer = await signInAt('ada', { host: 'localhost:5173' });
    expect(answer.status).toBe(302);
    expect(answer.headers['location']).toBe('/');
    expect(answer.headers['set-cookie']).toEqual(['nisc.token.5173=st_abc; HttpOnly; Path=/; SameSite=Lax', 'nisc.token.5173.held=1; Path=/; SameSite=Lax']);
    expect(answer.body).toBe('');
  });

  it('into the app’s own seat, when it has one', async () => {
    const answer = await signInAt('ada', { host: 'localhost:5173' }, 'nisc.token.desk');
    expect((answer.headers['set-cookie'] as string[])[0]).toMatch(/^nisc\.token\.desk\.5173=st_abc; HttpOnly/);
  });

  it('nobody of that name is told so, and no cookie is set', async () => {
    const answer = await signInAt('zed', { host: 'localhost:5173' });
    expect(answer.headers['set-cookie']).toBeUndefined();
    expect(answer.headers['location']).toBeUndefined();
    expect(answer.body).toBe('<p>nobody called zed</p>');
  });
});

// The plugin attaches the socket before any app has booted, and an edit swaps
// the app. How a connection is set (the largest message, compression) is the
// app's runtime's, carried by its server's socket: it has to follow the app
// that is booted NOW. The plugin attached one transport, once, with no
// settings, so in dev both ran on the defaults whatever the runtime said.
describe('the dev server’s socket', () => {
  const listeners: Server[] = [];
  afterAll(() => {
    for (const listener of listeners) listener.close();
  });

  // An app whose socket answers every message with how long it was, and says
  // how it is to be attached.
  const appHolding = (maxMessageBytes: number): DevApp => ({
    server: serverOf({
      socket: Object.assign(
        async (_url: string, connection: Parameters<SocketAccept>[1]): Promise<void> => {
          connection.onMessage((text) => connection.send(String(text.length)));
        },
        { stop: (): void => {}, transport: { maxMessageBytes } },
      ),
    }),
  });

  // The plugin on a real listener. `boots` is each boot in turn; the last one
  // is every boot after it.
  const dev = async (boots: readonly (() => Promise<DevApp>)[]): Promise<StandIn & { url: string }> => {
    const httpServer = createHttp((_req, res) => res.end('vite'));
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    listeners.push(httpServer);
    const address = httpServer.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    let booted = 0;
    const plugin = standIn(() => {
      const boot = boots[Math.min(booted, boots.length - 1)];
      booted += 1;
      return boot === undefined ? Promise.reject(new Error('no boot')) : boot();
    }, httpServer);
    return { ...plugin, url: `ws://127.0.0.1:${address.port}/socket` };
  };

  const opened = (url: string): Promise<WebSocket> =>
    new Promise((resolve, reject) => {
      const client = new WebSocket(url);
      client.once('open', () => resolve(client));
      client.once('error', reject);
    });
  // What became of 2,000 bytes sent on a connection: how long the server said
  // they were, or the code it closed the connection with.
  const sent2000 = (client: WebSocket): Promise<string | number> => {
    const closed = new Promise<number>((resolve) => client.once('close', (code) => resolve(code)));
    const answer = new Promise<string>((resolve) => client.once('message', (data) => resolve(String(data))));
    client.send('a'.repeat(2000));
    return Promise.race([closed, answer]);
  };
  const later = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  it('a connection is set as the app that is booted says, one that arrived while it was booting included', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { url } = await dev([async () => (await later(40), appHolding(1024))]);
      // made before the app is up: it waits for the boot, as a page does
      expect(await sent2000(await opened(url))).toBe(1009);
      expect(await sent2000(await opened(url))).toBe(1009);
    } finally {
      warned.mockRestore();
    }
  });

  it('after an edit, as the app that booted then says; and the connections of the app that was let go are closed', async () => {
    const { url, edit, said } = await dev([async () => appHolding(1024), async () => appHolding(4096)]);
    const before = await opened(url);
    const beforeClosed = new Promise<number>((resolve) => before.once('close', (code) => resolve(code)));
    edit('/project/src/app/app.ts');
    await vi.waitFor(() => expect(said.some((line) => line.includes('re-booted'))).toBe(true), { timeout: 2000 });
    // the app it was attached to is gone: it is told so, and its terminal connects again
    expect(await Promise.race([beforeClosed, later(1000).then(() => 'still open')])).toBe(1001);
    const after = await opened(url);
    expect(await sent2000(after)).toBe('2000');
    after.close();
  });

  it('an app that did not boot refuses the upgrade (503), and the next one that boots is served', async () => {
    const { url, edit, said } = await dev([async () => Promise.reject(new Error('a broken edit')), async () => appHolding(4096)]);
    const refused = await new Promise<string>((resolve) => {
      const client = new WebSocket(url);
      client.once('open', () => resolve('opened'));
      client.once('error', (error) => resolve(error.message));
    });
    expect(refused).toMatch(/503/);
    edit('/project/src/app/app.ts');
    await vi.waitFor(() => expect(said.some((line) => line.includes('re-booted'))).toBe(true), { timeout: 2000 });
    const client = await opened(url);
    expect(await sent2000(client)).toBe('2000');
    client.close();
  });
});
