import { subscribe } from 'node:diagnostics_channel';
import { Socket } from 'node:net';
import { Agent, setGlobalDispatcher } from 'undici';
import { z } from 'zod';

// Node's built-in fetch drops an idle connection after about four seconds. It uses npm undici's
// global dispatcher, so the one installed here also serves signal's adapters and the Groq SDK.
const KEEP_ALIVE_MS = 60_000;
const KEEP_ALIVE_MAX_MS = 600_000;

let isInstalled = false;
let connects = 0;

// Open sockets per origin, counted from each socket's own `close`. Time since last use
// would not do: the far end may hang up an idle socket long before our keep-alive ends.
const open = new Map<string, number>();

const Connected = z.object({ connectParams: z.object({ hostname: z.string(), protocol: z.string().optional(), port: z.union([z.string(), z.number()]).optional() }).loose(), socket: z.instanceof(Socket) }).loose();

const originKey = (hostname: string, protocol: string | undefined, port: string | number | undefined): string => `${hostname}:${port === undefined || String(port) === '' ? (protocol === 'https:' ? '443' : '80') : String(port)}`;

export const installWarmDispatcher = (): void => {
  if (isInstalled) return;
  isInstalled = true;
  setGlobalDispatcher(new Agent({ keepAliveTimeout: KEEP_ALIVE_MS, keepAliveMaxTimeout: KEEP_ALIVE_MAX_MS, connections: 2 }));
  subscribe('undici:client:connected', (message) => {
    connects += 1;
    const connected = Connected.safeParse(message);
    if (!connected.success) return;
    const key = originKey(connected.data.connectParams.hostname, connected.data.connectParams.protocol, connected.data.connectParams.port);
    open.set(key, (open.get(key) ?? 0) + 1);
    connected.data.socket.once('close', () => open.set(key, Math.max(0, (open.get(key) ?? 1) - 1)));
  });
};

export const openConnectionsTo = (baseUrl: string): number => {
  const url = new URL(baseUrl);
  return open.get(originKey(url.hostname, url.protocol, url.port)) ?? 0;
};

export const connectionsOpened = (): number => connects;
