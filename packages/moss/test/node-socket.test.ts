import { describe, it, expect, afterAll, vi } from 'vitest';
import { createServer as createHttp } from 'node:http';
import { connect as connectTcp } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { attachSocket } from '../src/node';
import { createSocket, offerToken, PROTOCOL } from '../src/socket';
import type { SocketAccept } from '../src/socket';
import { createWire } from '../src/client';
import { nodeEnv } from '../src/client/node';

// ═══════════════════════════════════════════════════════════════
// The `ws` half of the transport seam, over a REAL websocket. Everything above
// the seam is driven through a fake connection elsewhere; what only a real one
// can show is what the transport itself does with a client it refuses.
// ═══════════════════════════════════════════════════════════════

const servers: Server[] = [];

// A server that answers every message with how long it was — enough to prove a
// connection is being served, and that a message arrived whole.
const listening = async (options?: Parameters<typeof attachSocket>[3]): Promise<string> => {
  const accept: SocketAccept = Object.assign(
    async (_url: string, connection: Parameters<SocketAccept>[1]): Promise<void> => {
      connection.onMessage((text) => connection.send(String(text.length)));
    },
    { stop: (): void => {} },
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

// What the server said back to one message.
const answered = (client: WebSocket, text: string): Promise<string> => {
  const answer = new Promise<string>((resolve) => client.once('message', (data) => resolve(String(data))));
  client.send(text);
  return answer;
};

// The limit a connection is held to when the host says nothing.
const LIMIT = 256 * 1024;

afterAll(() => {
  for (const server of servers) server.close();
});

describe('the ws transport', () => {
  // `ws` reports a frame it refuses as an 'error' on that connection, and an
  // 'error' nobody listens for is thrown by Node out of the socket's data
  // handler. Before the transport listened, this one frame ended the process.
  it('a frame the transport refuses closes that connection, and nothing else', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const escaped: unknown[] = [];
    const onEscape = (error: unknown): void => void escaped.push(error);
    process.on('uncaughtException', onEscape);
    try {
      const url = await listening();
      const bystander = await opened(url);
      const client = await opened(url);

      // A TEXT frame whose bytes are not UTF-8: refused by the receiver (1007).
      const closed = new Promise<number>((resolve) => client.once('close', (code) => resolve(code)));
      client.send(Buffer.from([0xff, 0xfe, 0xfd]), { binary: false });
      expect(await closed).toBe(1007);
      // give a throw out of the server's data handler the turn it would need
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(escaped).toEqual([]);

      // The connection beside it is still being served, and so is a new one.
      for (const other of [bystander, await opened(url)]) {
        expect(await answered(other, 'still here')).toBe('10');
        other.close();
      }
      expect(warned).toHaveBeenCalledTimes(1);
    } finally {
      process.off('uncaughtException', onEscape);
      warned.mockRestore();
    }
  });

  // What a message carries the server keeps and sends back in every later
  // frame, so a connection is held to 256 KB a message unless the host says
  // otherwise. Told nothing, `ws` took 100 MiB.
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

  // The limit is on the message, not on what crossed the wire: 8 MB of one
  // letter is a few KB compressed, and is refused all the same.
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
});

// Who a terminal is rides the upgrade request — a header of it, not its
// address. Only a real handshake shows what the two ends put on the wire.
describe('the ws transport — the upgrade says who is asking', () => {
  // the real protocol layer behind the real transport; what it was asked, and
  // every request line it was reached by (what an access log would hold)
  const serving = async (decidingTakesMs = 0): Promise<{ url: string; requestLines: string[]; asked: string[]; served: (string | null)[] }> => {
    const requestLines: string[] = [];
    const asked: string[] = [];
    const served: (string | null)[] = [];
    const accept = createSocket({
      session: async (token) => (asked.push(token), await new Promise((later) => setTimeout(later, decidingTakesMs)), token === 'tok/with+symbols=' ? 'usr_1' : null),
      catalog: (principal) => (served.push(principal), { ids: [], hash: 'h' }),
      revalidateMs: 0,
    });
    const httpServer = createHttp((_req, res) => res.end('ok'));
    httpServer.on('upgrade', (req) => void requestLines.push(`${req.method} ${req.url}`));
    attachSocket(httpServer, accept);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    servers.push(httpServer);
    const address = httpServer.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    return { url: `ws://127.0.0.1:${address.port}/socket`, requestLines, asked, served };
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
    // a client that offers its token and not `nisc` is answered with nothing to agree on
    const alone = new Promise<string>((resolve) => {
      const socket = new WebSocket(`${url}?protocol=${PROTOCOL}`, offer.slice(1));
      socket.once('open', () => resolve(`opened as ${socket.protocol}`));
      socket.once('error', (error) => resolve(error.message));
    });
    expect(await alone).toMatch(/no subprotocol/i);
  });

  // The answer to the upgrade is the one moment a browser's cookie can be
  // written; what a real handshake carries back is the only proof it was.
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
    // what a browser would send back: the pairs, and nothing offered
    const nothingNew = await answeredWith({ origin, cookie: written.map((cookie) => cookie.split(';')[0]).join('; ') }, offerToken(null));
    await vi.waitFor(() => expect(served).toEqual(['usr_1', 'usr_1']));
    expect(nothingNew).toEqual([]);
  });

  // Until moss has decided, the request is not answered and the raw socket is
  // nobody's to listen to: a peer that resets it then must be that request's
  // alone, not an 'error' thrown out of Node.
  it('a peer that is gone before it is answered takes nothing down, and leaves nothing attached', async () => {
    const { url, asked, served } = await serving(80);
    const { hostname, port } = new URL(url);
    const peer = connectTcp(Number(port), hostname);
    await new Promise<void>((connected) => peer.once('connect', () => connected()));
    // it offers a token, so who it is takes the verifier's 80 ms to decide — and it is gone before that
    peer.write(`GET /socket?protocol=${PROTOCOL} HTTP/1.1\r\nHost: ${hostname}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: ${offerToken('tok/with+symbols=').join(', ')}\r\n\r\n`);
    await vi.waitFor(() => expect(asked).toHaveLength(1));
    peer.resetAndDestroy();
    await new Promise((decided) => setTimeout(decided, 250));
    expect(served).toEqual(['usr_1']); // decided after it had gone, and said to nobody
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
