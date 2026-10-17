import { describe, it, expect, vi, afterEach } from 'vitest';
import { createServer as createTcp, connect as connectTcp } from 'node:net';
import { Hono } from 'hono';
import { WebSocket } from 'ws';
import type { NiscApp } from '../src/manifest';
import type { NiscRuntime } from '../src/runtime';
import type { MossServer } from '../src/server';
import type { SocketAccept } from '../src/socket';

const mossClosed = vi.fn();

const said: { transport?: SocketAccept['transport'] } = {};
const checked = vi.fn(async (): Promise<void> => undefined);

vi.mock('../src/server/server', () => ({
  createServer: async (): Promise<MossServer> => {
    const accept: SocketAccept = Object.assign(
      async (_url: string, connection: Parameters<SocketAccept>[1]): Promise<void> => {
        connection.onMessage((text) => connection.send(String(text.length)));
      },
      { stop: (): void => {}, ...said },
    );
    return Object.assign(new Hono(), { socket: accept, close: mossClosed, checkFunctions: checked }) as unknown as MossServer;
  },
}));

const { serve } = await import('../src/node');

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createTcp();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => (address === null || typeof address === 'string' ? reject(new Error('no port')) : resolve(address.port)));
    });
  });

const opened = (url: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const client = new WebSocket(url);
    client.once('open', () => resolve(client));
    client.once('error', reject);
  });

const accepts = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = connectTcp(port, '127.0.0.1');
    probe.once('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', () => resolve(false));
  });

const within = <T>(ms: number, work: Promise<T>): Promise<T | 'never'> => Promise.race([work, new Promise<'never'>((resolve) => setTimeout(() => resolve('never'), ms))]);

const served: MossServer[] = [];
const serving = async (runtime: Partial<NiscRuntime> = {}): Promise<{ server: MossServer; port: number }> => {
  const logged = vi.spyOn(console, 'log').mockImplementation(() => {});
  const port = await freePort();
  const server = await serve({} as NiscApp, { ...(runtime as NiscRuntime), port });
  logged.mockRestore();
  served.push(server);
  await vi.waitFor(async () => expect(await accepts(port)).toBe(true));
  return { server, port };
};

afterEach(() => {
  for (const server of served.splice(0)) server.close();
  mossClosed.mockClear();
  checked.mockReset();
  checked.mockImplementation(async () => undefined);
  delete said.transport;
});

describe('serve', () => {
  it('checks the app’s functions before it listens, and a refusal closes what was built and is thrown', async () => {
    checked.mockRejectedValueOnce(new Error('Actions call functions the app does not have — refusing to serve:'));
    const port = await freePort();

    await expect(serve({} as NiscApp, { port } as unknown as NiscRuntime)).rejects.toThrow('refusing to serve');

    expect(mossClosed).toHaveBeenCalledTimes(1);
    expect(await accepts(port)).toBe(false);
  });

  it('what it started, the server it returns stops: its own timers, every connection, and the listener', async () => {
    const { server, port } = await serving();
    const client = await opened(`ws://127.0.0.1:${port}/socket`);
    const closed = new Promise<number>((resolve) => client.once('close', (code) => resolve(code)));

    server.close();

    expect(mossClosed).toHaveBeenCalledTimes(1);
    expect(await within(2000, closed)).toBe(1001);
    await vi.waitFor(async () => expect(await accepts(port)).toBe(false));
  });

  it('the largest message a connection may send is what the server’s socket says', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    said.transport = { maxMessageBytes: 1024 };
    const { port } = await serving();
    const client = await opened(`ws://127.0.0.1:${port}/socket`);
    const answer = new Promise<string>((resolve) => client.once('message', (data) => resolve(String(data))));
    const closed = new Promise<number>((resolve) => client.once('close', (code) => resolve(code)));
    client.send('a'.repeat(2000));
    expect(await within(2000, Promise.race([closed, answer]))).toBe(1009);
    warned.mockRestore();
  });

  it('told nothing, a connection is held to the transport’s own limit of 256 KB', async () => {
    const { port } = await serving();
    const client = await opened(`ws://127.0.0.1:${port}/socket`);
    const answer = new Promise<string>((resolve) => client.once('message', (data) => resolve(String(data))));
    client.send('a'.repeat(2000));
    expect(await within(2000, answer)).toBe('2000');
    client.close();
  });
});
