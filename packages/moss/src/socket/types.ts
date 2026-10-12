import type { Telemetry } from '../runtime';
import type { ShellHost } from '../shells';

export type SessionSource = Pick<ShellHost, 'session'>;

export type HeldCatalog = { ids: readonly string[]; hash: string };

export type SocketConfig = {
  session: (token: string) => string | null | Promise<string | null>;
  catalog: (principal: string | null) => HeldCatalog | Promise<HeldCatalog>;
  shells?: SessionSource;
  page?: (path: string) => { host: SessionSource; inputs: Record<string, Record<string, unknown>> } | undefined;
  anonymousShellMax?: number;
  // `0` or `Infinity` disables it.
  revalidateMs?: number;
  telemetry?: Telemetry;
  origins?: readonly string[];
  sessionLastsMs?: (token: string) => number | null | Promise<number | null>;
};

export type Connection = {
  send: (text: string) => void;
  close: (code?: number, reason?: string) => void;
  onMessage: (fn: (text: string) => void) => void;
  onClose: (fn: () => void) => void;
  // `answer`: given by a transport that has not answered the request yet. It is
  // called once with the `Set-Cookie` values that answer is to carry.
  upgrade?: {
    offered: readonly string[];
    origin?: string | null;
    host?: string | null;
    cookie?: string | null;
    answer?: (cookies: readonly string[]) => void;
  };
  // Set by the socket, never by a transport.
  seal?: (token: string) => Promise<string>;
};

export type TransportSettings = { compression?: boolean | Record<string, unknown>; maxMessageBytes?: number };

export type SocketAccept = ((url: string, connection: Connection) => Promise<void>) & { stop: () => void; transport?: TransportSettings };
