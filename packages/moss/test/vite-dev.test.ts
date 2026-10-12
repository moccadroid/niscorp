import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import { createServer as createHttp } from 'node:http';
import type { Server } from 'node:http';
import type { ViteDevServer } from 'vite';
import { WebSocket } from 'ws';
import { mossDev } from '../src/server/vite';
import type { DevApp, MossDevOptions } from '../src/server/vite';
import type { MossServer } from '../src/server';
import type { SocketAccept } from '../src/socket';

type Middleware = (req: unknown, res: unknown, next: () => void) => void;
type StandIn = { middleware: () => Middleware | undefined; edit: (file: string) => void; said: string[] };

const standIn = (app: () => Promise<DevApp>, httpServer: Server | null = null, options: Omit<MossDevOptions, 'app'> = {}): StandIn => {
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
  (mossDev({ ...options, app }).configureServer as (server: ViteDevServer) => void)(vite);
  return { middleware: () => middleware, edit: (file) => watching[0]?.(file), said };
};

const serverOf = (parts: { socket?: SocketAccept }): MossServer => ({ fetch: async () => new Response('app'), close: () => {}, ...parts }) as unknown as MossServer;

type SignInAnswer = { status: number; headers: Record<string, string | string[]>; body: string; passedOn: boolean; asked: string[] };
const signInAt = async (
  who: string,
  headers: Record<string, string>,
  over: { tokenKey?: string; from?: string | undefined; options?: Omit<MossDevOptions, 'app'>; noSignIn?: boolean } = {},
): Promise<SignInAnswer> => {
  const asked: string[] = [];
  const { middleware } = standIn(
    async () => ({
      server: serverOf({}),
      ...(over.noSignIn === true ? {} : { signIn: (name: string) => (asked.push(name), name === 'ada' ? 'st_abc' : null) }),
      ...(over.tokenKey !== undefined ? { tokenKey: over.tokenKey } : {}),
    }),
    null,
    over.options,
  );
  const remoteAddress = 'from' in over ? over.from : '127.0.0.1';
  return new Promise((resolve) => {
    const answered: { status: number; headers: Record<string, string | string[]> } = { status: 200, headers: {} };
    const res = {
      set statusCode(code: number) {
        answered.status = code;
      },
      setHeader: (name: string, value: string | string[]) => void (answered.headers[name] = value),
      end: (body?: string) => resolve({ ...answered, body: body ?? '', passedOn: false, asked }),
    };
    middleware()?.({ url: `/dev/as/${who}`, headers, socket: { remoteAddress } }, res, () => resolve({ ...answered, body: '', passedOn: true, asked }));
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
    const answer = await signInAt('ada', { host: 'localhost:5173' }, { tokenKey: 'nisc.token.desk' });
    expect((answer.headers['set-cookie'] as string[])[0]).toMatch(/^nisc\.token\.desk\.5173=st_abc; HttpOnly/);
  });

  it('nobody of that name is told so, and no cookie is set', async () => {
    const answer = await signInAt('zed', { host: 'localhost:5173' });
    expect(answer.headers['set-cookie']).toBeUndefined();
    expect(answer.headers['location']).toBeUndefined();
    expect(answer.body).toBe('<p>nobody called zed</p>');
  });

  describe('answers this machine, and nobody else', () => {
    it.each([['127.0.0.1'], ['127.8.9.10'], ['::1'], ['::ffff:127.0.0.1'], ['::ffff:7f00:1']])('a request from %s is this machine’s, and is signed in', async (from) => {
      const answer = await signInAt('ada', { host: 'localhost:5173' }, { from });
      expect(answer.status).toBe(302);
      expect(answer.headers['set-cookie']).toBeDefined();
    });

    it.each([
      ['another device on the network', '192.168.1.20'],
      ['another device, as an IPv4-mapped address', '::ffff:192.168.1.20'],
      ['a private address that only starts like loopback', '12.7.0.1'],
      ['a link-local IPv6 address', 'fe80::1'],
      ['a public IPv6 address', '2001:db8::1'],
      ['the unspecified address', '0.0.0.0'],
      ['a socket with no address left', undefined],
    ])('a request from %s is refused, told why, and the app is not asked', async (_who, from) => {
      const answer = await signInAt('ada', { host: '192.168.1.5:5173' }, { from });
      expect(answer.status).toBe(403);
      expect(answer.headers['set-cookie']).toBeUndefined();
      expect(answer.headers['location']).toBeUndefined();
      expect(answer.body).toContain('this machine');
      expect(answer.body).toContain('signInFromNetwork');
      expect(answer.asked).toEqual([]);
      expect(answer.passedOn).toBe(false);
    });

    it('what a header says of where a request came from is not believed', async () => {
      const answer = await signInAt('ada', { host: 'localhost:5173', 'x-forwarded-for': '127.0.0.1', forwarded: 'for=127.0.0.1', 'x-real-ip': '::1' }, { from: '192.168.1.20' });
      expect(answer.status).toBe(403);
      expect(answer.asked).toEqual([]);
    });

    it('`signInFromNetwork: true` opens it to every device that can reach the dev server', async () => {
      const answer = await signInAt('ada', { host: '192.168.1.5:5173' }, { from: '192.168.1.20', options: { signInFromNetwork: true } });
      expect(answer.status).toBe(302);
      expect(answer.headers['set-cookie']).toEqual(['nisc.token.5173=st_abc; HttpOnly; Path=/; SameSite=Lax', 'nisc.token.5173.held=1; Path=/; SameSite=Lax']);
    });

    it('an app with no sign-in has no such address, wherever it is asked from: the request is vite’s', async () => {
      const answer = await signInAt('ada', { host: '192.168.1.5:5173' }, { from: '192.168.1.20', noSignIn: true });
      expect(answer.passedOn).toBe(true);
    });
  });
});

describe('the dev server — an edit', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const booting = (boots: readonly ('up' | 'broken')[]) => {
    const made = { boots: 0 };
    const plugin = standIn(async () => {
      made.boots += 1;
      const nth = made.boots;
      if (boots[Math.min(nth, boots.length) - 1] === 'broken') throw new Error('a broken edit');
      return { server: serverOf({ socket: Object.assign(async (): Promise<void> => undefined, { stop: (): void => {} }) }), signIn: () => `st_boot_${nth}` };
    });
    const servedBy = (): Promise<string> =>
      new Promise((resolve) => {
        const answered: { cookie: string } = { cookie: '' };
        const res = {
          statusCode: 200,
          setHeader: (name: string, value: string | string[]) => {
            if (name === 'set-cookie') answered.cookie = String(value);
          },
          end: (body?: string) => resolve(answered.cookie === '' ? (body ?? '') : answered.cookie),
        };
        plugin.middleware()?.({ url: '/dev/as/ada', headers: { host: 'localhost:5173' }, socket: { remoteAddress: '127.0.0.1' } }, res, () => resolve('passed on'));
      });
    return { ...plugin, made, servedBy };
  };

  it('a file of the app re-boots it, once for a burst of changes; a file that is not the app’s does not', async () => {
    vi.useFakeTimers();
    const { edit, made, servedBy } = booting(['up']);
    expect(await servedBy()).toContain('st_boot_1');

    for (const file of ['/project/src/main.tsx', '/project/README.md', '/project/src/styles.css']) edit(file);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(made.boots).toBe(1);

    for (const file of ['/project/src/app/app.ts', '/project/src/server/boot.ts', '/project/nisc.config.ts']) edit(file);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(made.boots).toBe(2);
    expect(await servedBy()).toContain('st_boot_2');
  });

  it('an edit that does not boot leaves the app that was serving in place, and says why', async () => {
    vi.useFakeTimers();
    const { edit, said, servedBy } = booting(['up', 'broken', 'up']);
    expect(await servedBy()).toContain('st_boot_1');

    edit('/project/src/app/app.ts');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(said.filter((line) => line.includes('re-boot failed'))).toEqual(['[moss] re-boot failed: a broken edit']);
    expect(await servedBy()).toContain('st_boot_1');

    edit('/project/src/app/app.ts');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await servedBy()).toContain('st_boot_3');
  });
});

describe('the dev server’s socket', () => {
  const listeners: Server[] = [];
  afterAll(() => {
    for (const listener of listeners) listener.close();
  });

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
  const sent2000 = (client: WebSocket): Promise<string | number> => {
    const closed = new Promise<number>((resolve) => client.once('close', (code) => resolve(code)));
    const answer = new Promise<string>((resolve) => client.once('message', (data) => resolve(String(data))));
    client.send('a'.repeat(2000));
    return Promise.race([closed, answer]);
  };

  it('a connection is set as the app that is booted says, one that arrived while it was booting included', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const boot = { finish: (): void => {} };
      const booting = new Promise<void>((resolve) => void (boot.finish = resolve));
      const { url } = await dev([async () => (await booting, appHolding(1024))]);
      const early = opened(url);
      boot.finish();
      expect(await sent2000(await early)).toBe(1009);
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
    // The 200 ms the plugin waits after the last change is real here, because the socket is.
    await vi.waitFor(() => expect(said.some((line) => line.includes('re-booted'))).toBe(true), { timeout: 2000 });
    expect(await beforeClosed).toBe(1001);
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
