import { CLOSE_INVALID_TOKEN } from '../protocol';
import type { ServerMessage } from '../protocol';
import type { Connection, SocketConfig } from './socket';

export const DEFAULT_REVALIDATE_MS = 60 * 1000;

// Node holds a timer's delay in 31 bits and cuts a longer one to 1 ms: an
// interval above this is no revalidation, as `0` is.
const MAX_INTERVAL_MS = 2 ** 31 - 1;

export type Credential = { token: string; principal: string } | null;

export type Revalidation = {
  hold: (connection: Connection, credential: Credential) => void;
  release: (connection: Connection) => void;
  stop: () => void;
};

export const createRevalidation = (config: Pick<SocketConfig, 'session' | 'revalidateMs'>): Revalidation => {
  const live = new Map<Connection, Credential>();

  const expire = (connection: Connection): void => {
    live.delete(connection);
    const told = (): void => connection.send(JSON.stringify({ type: 'error', code: 'invalid_token', message: 'The session token no longer resolves to this principal.' } satisfies ServerMessage));
    const closed = (): void => connection.close(CLOSE_INVALID_TOKEN, 'session expired');
    for (const step of [told, closed]) {
      try {
        step();
      } catch (error) {
        console.error('[moss/socket] a connection whose session expired could not be told so or closed, and is let go:', error);
      }
    }
  };

  const revalidate = async (): Promise<void> => {
    let asked = 0;
    const unanswered: unknown[] = [];
    for (const [connection, credential] of [...live]) {
      if (credential === null) continue;
      asked += 1;
      let resolved: string | null;
      try {
        resolved = await config.session(credential.token);
      } catch (error) {
        // An unreachable verifier is not evidence that a session ended: the
        // connection stays, and is asked about again next pass.
        unanswered.push(error);
        continue;
      }
      if (resolved === credential.principal) continue;
      if (!live.has(connection)) continue;
      expire(connection);
    }
    if (unanswered.length > 0) {
      console.error(`[moss/socket] the session verifier could not be asked about ${unanswered.length} of ${asked} connection(s). They stay open and are asked again:`, unanswered[0]);
    }
  };

  let passing = false;
  const pass = async (): Promise<void> => {
    if (passing) return;
    passing = true;
    try {
      await revalidate();
    } catch (error) {
      console.error('[moss/socket] a revalidation pass failed, and the next one starts over:', error);
    } finally {
      passing = false;
    }
  };

  const revalidateMs = config.revalidateMs ?? DEFAULT_REVALIDATE_MS;
  let sweeper: ReturnType<typeof setInterval> | undefined;
  if (revalidateMs > 0 && revalidateMs <= MAX_INTERVAL_MS) {
    sweeper = setInterval(() => void pass(), revalidateMs);
    sweeper.unref?.();
  }

  return {
    hold: (connection, credential) => {
      live.set(connection, credential);
    },
    release: (connection) => {
      live.delete(connection);
    },
    stop: () => {
      if (sweeper !== undefined) clearInterval(sweeper);
      sweeper = undefined;
    },
  };
};
