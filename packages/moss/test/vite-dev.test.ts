import { describe, it, expect } from 'vitest';
import type { ViteDevServer } from 'vite';
import { mossDev } from '../src/vite';
import type { MossServer } from '../src/server';

// The dev server's own sign-in (`/dev/as/<who>`), driven through the
// middleware the plugin registers — vite itself is a stand-in.
const signInAt = async (who: string, headers: Record<string, string>, tokenKey?: string): Promise<{ status: number; headers: Record<string, string | string[]>; body: string; passedOn: boolean }> => {
  let middleware: ((req: unknown, res: unknown, next: () => void) => void) | undefined;
  const vite = {
    config: { logger: { error: () => {}, info: () => {} }, root: '.' },
    httpServer: null,
    watcher: { on: () => {} },
    ws: { send: () => {} },
    middlewares: { use: (fn: typeof middleware) => void (middleware = fn) },
    ssrLoadModule: async () => ({}),
  } as unknown as ViteDevServer;
  const plugin = mossDev({
    app: async () => ({
      server: { fetch: async () => new Response('app') } as unknown as MossServer,
      signIn: (name: string) => (name === 'ada' ? 'st_abc' : null),
      ...(tokenKey !== undefined ? { tokenKey } : {}),
    }),
  });
  (plugin.configureServer as (server: ViteDevServer) => void)(vite);
  return new Promise((resolve) => {
    const answered: { status: number; headers: Record<string, string | string[]> } = { status: 200, headers: {} };
    const res = {
      set statusCode(code: number) {
        answered.status = code;
      },
      setHeader: (name: string, value: string | string[]) => void (answered.headers[name] = value),
      end: (body?: string) => resolve({ ...answered, body: body ?? '', passedOn: false }),
    };
    middleware?.({ url: `/dev/as/${who}`, headers, socket: {} }, res, () => resolve({ ...answered, body: '', passedOn: true }));
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
