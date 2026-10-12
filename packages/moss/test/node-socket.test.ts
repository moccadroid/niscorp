import { describe, it, expect, afterAll, vi } from 'vitest';
import { createServer as createHttp } from 'node:http';
import { connect as connectTcp } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { attachSocket } from '../src/node';
import { buildSocket } from '../src/server/server';
import { createSocket } from '../src/socket';
import { offerToken, PROTOCOL } from '../src/protocol';
import type { SocketAccept } from '../src/socket';
import { createWire } from '../src/client';
import { nodeEnv } from '../src/client/node';

const servers: Server[] = [];

const listening = async (options?: Parameters<typeof attachSocket>[3], transport?: SocketAccept['transport']): Promise<string> => {
  const accept: SocketAccept = Object.assign(
    async (_url: string, connection: Parameters<SocketAccept>[1]): Promise<void> => {
      connection.onMessage((text) => connection.send(String(text.length)));
    },
    { stop: (): void => {}, ...(transport !== undefined ? { transport } : {}) },
  );
  const httpServer = createHttp((_req, res) => res.end('ok'));
  attachSocket(httpServer, accept, '/socket', options);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  servers.push(httpServer);
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return `ws://127.0.0.1:${address.port}/socket`;
};

const opened = (url: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const client = new WebSocket(url);
    client.once('open', () => resolve(client));
    client.once('error', reject);
  });

const answered = (client: WebSocket, text: string): Promise<string> => {
  const answer = new Promise<string>((resolve) => client.once('message', (data) => resolve(String(data))));
  client.send(text);
  return answer;
};

const LIMIT = 256 * 1024;

afterAll(() => {
  for (const server of servers) server.close();
});

describe('the ws transport', () => {
  // `ws` reports a refused frame as an 'error' on the connection, and Node throws an error nobody listens for.
  it('a frame the transport refuses closes that connection, and nothing else', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const escaped: unknown[] = [];
    const onEscape = (error: unknown): void => void escaped.push(error);
    process.on('uncaughtException', onEscape);
    try {
      const url = await listening();
      const bystander = await opened(url);
      const client = await opened(url);

      const closed = new Promise<number>((resolve) => client.once('close', (code) => resolve(code)));
      client.send(Buffer.from([0xff, 0xfe, 0xfd]), { binary: false });
      expect(await closed).toBe(1007);

      for (const other of [bystander, await opened(url)]) {
        expect(await answered(other, 'still here')).toBe('10');
        other.close();
      }
      // Asked after two more answers: a throw from the refused frame would have come before them.
      expect(escaped).toEqual([]);
      expect(warned).toHaveBeenCalledTimes(1);
    } finally {
      process.off('uncaughtException', onEscape);
      warned.mockRestore();
    }
  });

  it('a message of 256 KB arrives; one byte more closes that connection with 1009, and nothing else', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const url = await listening();
      const bystander = await opened(url);
      const client = await opened(url);

      expect(await answered(client, 'a'.repeat(LIMIT))).toBe(String(LIMIT));

      const closed = new Promise<number>((resolve) => client.once('close', (code) => resolve(code)));
      client.send('a'.repeat(LIMIT + 1));
      expect(await closed).toBe(1009);
      expect(await answered(bystander, 'still here')).toBe('10');
      bystander.close();
    } finally {
      warned.mockRestore();
    }
  });

  it('a message that is small on the wire and large once inflated is refused', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const client = await opened(await listening());
      expect(client.extensions).toContain('permessage-deflate');
      const wire = (client as unknown as { _socket: { bytesWritten: number } })._socket;
      const before = wire.bytesWritten;
      const closed = new Promise<number>((resolve) => client.once('close', (code) => resolve(code)));
      client.send('a'.repeat(8 * 1024 * 1024));
      expect(await closed).toBe(1009);
      expect(wire.bytesWritten - before).toBeLessThan(LIMIT);
    } finally {
      warned.mockRestore();
    }
  });

  it('a host that takes larger messages says so: maxMessageBytes', async () => {
    const client = await opened(await listening({ maxMessageBytes: 4 * LIMIT }));
    expect(await answered(client, 'a'.repeat(LIMIT + 1))).toBe(String(LIMIT + 1));
    client.close();
  });

  it('an accept that says how it is to be attached is attached that way by a host that says nothing', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const client = await opened(await listening(undefined, { maxMessageBytes: 1024, compression: false }));
      expect(client.extensions).not.toContain('permessage-deflate');
      expect(await answered(client, 'a'.repeat(1024))).toBe('1024');
      const closed = new Promise<number>((resolve) => client.once('close', (code) => resolve(code)));
      const answer = new Promise<string>((resolve) => client.once('message', (data) => resolve(String(data))));
      client.send('a'.repeat(1025));
      expect(await Promise.race([closed, answer])).toBe(1009);
    } finally {
      warned.mockRestore();
    }
  });

  it('and a host that says otherwise is the one heard, for the setting it names', async () => {
    const client = await opened(await listening({ maxMessageBytes: 4096 }, { maxMessageBytes: 1024, compression: false }));
    expect(await answered(client, 'a'.repeat(2000))).toBe('2000');
    expect(client.extensions).not.toContain('permessage-deflate');
    client.close();
  });
});

describe('the ws transport — a server’s socket says how it is to be attached', () => {
  const serving = async (settings: { socketMaxMessageBytes?: number; socketCompression?: boolean }): Promise<string> => {
    const socket = buildSocket({
      runtime: { pool: { query: async () => ({ rows: [] }) }, session: 'dev-open', sessionRevalidateMs: 0, ...settings },
      session: () => null,
      identity: { resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, memoKey: 'public' }) },
      running: { catalogFor: () => ({ ids: [], hash: 'h' }) },
      hosts: { shells: undefined, pageAt: () => undefined },
    });
    const httpServer = createHttp((_req, res) => res.end('ok'));
    attachSocket(httpServer, socket);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    servers.push(httpServer);
    const address = httpServer.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    return `ws://127.0.0.1:${address.port}/socket?protocol=${PROTOCOL}`;
  };

  const greeted = (url: string): Promise<WebSocket> =>
    new Promise((resolve, reject) => {
      const client = new WebSocket(url);
      client.once('message', () => resolve(client));
      client.once('error', reject);
    });

  it('`runtime.socketMaxMessageBytes` is the largest message a connection may send', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const client = await greeted(await serving({ socketMaxMessageBytes: 1024 }));
      const closed = new Promise<number>((resolve) => client.once('close', (code) => resolve(code)));
      const answer = new Promise<string>((resolve) => client.once('message', (data) => resolve(String(data))));
      client.send('a'.repeat(2000));
      expect(await Promise.race([closed, answer])).toBe(1009);
    } finally {
      warned.mockRestore();
    }
  });

  it('`runtime.socketCompression: false` is a connection that is not compressed', async () => {
    const client = await greeted(await serving({ socketCompression: false }));
    expect(client.extensions).not.toContain('permessage-deflate');
    client.close();
  });

  it('a runtime that says neither is served on the transport’s own: 256 KB, compressed', async () => {
    const client = await greeted(await serving({}));
    expect(client.extensions).toContain('permessage-deflate');
    const answer = new Promise<string>((resolve) => client.once('message', (data) => resolve(String(data))));
    client.send('a'.repeat(2000));
    expect(JSON.parse(await answer)).toMatchObject({ type: 'error', code: 'invalid_message' });
    client.close();
  });
});

describe('the ws transport — the upgrade says who is asking', () => {
  const serving = async (deciding: Promise<void> = Promise.resolve()): Promise<{ url: string; requestLines: string[]; asked: string[]; served: (string | null)[]; gone: Promise<void> }> => {
    const requestLines: string[] = [];
    const asked: string[] = [];
    const served: (string | null)[] = [];
    const peer = { gone: (): void => {} };
    const gone = new Promise<void>((resolve) => void (peer.gone = resolve));
    const accept = createSocket({
      session: async (token) => (asked.push(token), await deciding, token === 'tok/with+symbols=' ? 'usr_1' : null),
      catalog: (principal) => (served.push(principal), { ids: [], hash: 'h' }),
      revalidateMs: 0,
    });
    const httpServer = createHttp((_req, res) => res.end('ok'));
    httpServer.on('upgrade', (req, socket) => {
      requestLines.push(`${req.method} ${req.url}`);
      socket.once('close', () => peer.gone());
    });
    attachSocket(httpServer, accept);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    servers.push(httpServer);
    const address = httpServer.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    return { url: `ws://127.0.0.1:${address.port}/socket`, requestLines, asked, served, gone };
  };

  it('a terminal holding a token is served as its principal, and the token is in no request line', async () => {
    const { url, requestLines, asked, served } = await serving();
    const tokenFile = join(mkdtempSync(join(tmpdir(), 'moss-upgrade-')), 'token');
    writeFileSync(tokenFile, 'tok/with+symbols=\n');
    const wire = createWire({ env: nodeEnv({ url, tokenFile }) });
    try {
      await vi.waitFor(() => expect(served).toEqual(['usr_1']));
      expect(asked).toEqual(['tok/with+symbols=']);
      expect(requestLines).toEqual([`GET /socket?protocol=${PROTOCOL}`]);
    } finally {
      wire.dispose();
    }
  });

  it('the server answers `nisc`, and never says the token back', async () => {
    const { url } = await serving();
    const offer = offerToken('tok/with+symbols=');
    const client = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(`${url}?protocol=${PROTOCOL}`, offer);
      socket.once('open', () => resolve(socket));
      socket.once('error', reject);
    });
    expect(client.protocol).toBe('nisc');
    client.close();
    const alone = new Promise<string>((resolve) => {
      const socket = new WebSocket(`${url}?protocol=${PROTOCOL}`, offer.slice(1));
      socket.once('open', () => resolve(`opened as ${socket.protocol}`));
      socket.once('error', (error) => resolve(error.message));
    });
    expect(await alone).toMatch(/no subprotocol/i);
  });

  it('a token offered from the app’s own page comes back as a cookie on the 101, and that cookie alone signs the next upgrade in', async () => {
    const { url, served } = await serving();
    const origin = url.replace('ws://', 'http://').replace('/socket', '');
    const port = new URL(origin).port;
    const answeredWith = (headers: Record<string, string>, offered: string[]): Promise<string[]> =>
      new Promise((resolve, reject) => {
        const socket = new WebSocket(`${url}?protocol=${PROTOCOL}`, offered, { headers });
        socket.once('upgrade', (response) => resolve(response.headers['set-cookie'] ?? []));
        socket.once('error', reject);
        socket.once('open', () => socket.close());
      });
    const written = await answeredWith({ origin }, offerToken('tok/with+symbols='));
    expect(written).toEqual([`nisc.token.${port}=tok%2Fwith%2Bsymbols%3D; HttpOnly; Path=/; SameSite=Lax`, `nisc.token.${port}.held=1; Path=/; SameSite=Lax`]);
    const nothingNew = await answeredWith({ origin, cookie: written.map((cookie) => cookie.split(';')[0]).join('; ') }, offerToken(null));
    await vi.waitFor(() => expect(served).toEqual(['usr_1', 'usr_1']));
    expect(nothingNew).toEqual([]);
  });

  it('a terminal that asks to be handed sign-ins sealed is given its seal on the 101 — once', async () => {
    const { url } = await serving();
    const origin = url.replace('ws://', 'http://').replace('/socket', '');
    const answeredWith = (headers: Record<string, string>): Promise<string[]> =>
      new Promise((resolve, reject) => {
        const socket = new WebSocket(`${url}?protocol=${PROTOCOL}&sealed=1`, offerToken(null), { headers });
        socket.once('upgrade', (response) => resolve(response.headers['set-cookie'] ?? []));
        socket.once('error', reject);
        socket.once('open', () => socket.close());
      });
    const first = await answeredWith({ origin });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatch(/^nisc\.seal=[\w-]{43}; HttpOnly; Path=\/socket; SameSite=Lax$/);
    expect(await answeredWith({ origin, cookie: first[0]?.split(';')[0] ?? '' })).toEqual([]);
  });

  it('a peer that is gone before it is answered takes nothing down, and leaves nothing attached', async () => {
    const verifier = { decide: (): void => {} };
    const deciding = new Promise<void>((resolve) => void (verifier.decide = resolve));
    const { url, asked, served, gone } = await serving(deciding);
    const { hostname, port } = new URL(url);
    const peer = connectTcp(Number(port), hostname);
    await new Promise<void>((connected) => peer.once('connect', () => connected()));
    peer.write(`GET /socket?protocol=${PROTOCOL} HTTP/1.1\r\nHost: ${hostname}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: ${offerToken('tok/with+symbols=').join(', ')}\r\n\r\n`);
    await vi.waitFor(() => expect(asked).toHaveLength(1));
    peer.resetAndDestroy();
    await gone;
    verifier.decide();
    await vi.waitFor(() => expect(served).toEqual(['usr_1']));
    const next = await opened(`${url}?protocol=${PROTOCOL}`);
    await vi.waitFor(() => expect(served).toEqual(['usr_1', null]));
    next.close();
  });

  it('a request the library will not upgrade is refused by it, and the next terminal is served', async () => {
    const { url, served } = await serving();
    const { hostname, port } = new URL(url);
    const answer = await new Promise<string>((resolve) => {
      const peer = connectTcp(Number(port), hostname);
      let heard = '';
      peer.on('data', (chunk) => void (heard += String(chunk)));
      peer.on('close', () => resolve(heard));
      peer.on('error', () => resolve(heard));
      peer.once('connect', () => peer.write(`GET /socket?protocol=${PROTOCOL} HTTP/1.1\r\nHost: ${hostname}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: short\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    });
    expect(answer).toMatch(/^HTTP\/1\.1 400/);
    const next = await opened(`${url}?protocol=${PROTOCOL}`);
    await vi.waitFor(() => expect(served).toContain(null));
    next.close();
  });
});

describe('the ws transport — an upgrade that is not a session', () => {
  const attached = async (accept: (url: string) => Promise<void>): Promise<{ httpServer: Server; origin: string }> => {
    const httpServer = createHttp((_req, res) => res.end('ok'));
    attachSocket(httpServer, Object.assign((url: string) => accept(url), { stop: (): void => {} }), '/socket');
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    servers.push(httpServer);
    const address = httpServer.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    return { httpServer, origin: `ws://127.0.0.1:${address.port}` };
  };

  it('an upgrade to another path is left to whoever else hears the listener', async () => {
    const accepted: string[] = [];
    const { httpServer, origin } = await attached(async (url) => void accepted.push(url));
    const theirs = new WebSocketServer({ noServer: true });
    httpServer.on('upgrade', (req, socket, head) => {
      if (req.url !== '/theirs') return;
      theirs.handleUpgrade(req, socket, head, (connection) => connection.send('served by the other one'));
    });

    const heard = await new Promise<string>((resolve, reject) => {
      const client = new WebSocket(`${origin}/theirs`);
      client.once('message', (data) => {
        resolve(String(data));
        client.close();
      });
      client.once('error', reject);
    });
    expect(heard).toBe('served by the other one');
    expect(accepted).toEqual([]);
  });

  it('an accept that fails closes that connection, and what it failed with is in the log', async () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { origin } = await attached(() => Promise.reject(new Error('the accept failed')));
      const closed = await new Promise<number>((resolve, reject) => {
        const client = new WebSocket(`${origin}/socket`, { handshakeTimeout: 2_000 });
        client.once('close', (code) => resolve(code));
        client.once('error', reject);
      });
      expect(closed).toBe(1011);
      expect(said).toHaveBeenCalledWith('[moss/node] a connection escaped accept:', expect.objectContaining({ message: 'the accept failed' }));
    } finally {
      said.mockRestore();
    }
  });
});
