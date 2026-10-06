import { describe, it, expect, afterAll, vi } from 'vitest';
import { createServer as createHttp } from 'node:http';
import type { Server } from 'node:http';
import { WebSocket } from 'ws';
import { attachSocket } from '../src/node';
import type { SocketAccept } from '../src/socket';

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
});
