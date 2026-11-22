import { CLOSE_INVALID_TOKEN } from '../protocol';
import type { ServerMessage } from '../protocol';
import type { Connection, SocketConfig } from './socket';

export const DEFAULT_REVALIDATE_MS = 60 * 1000;

// Node keeps a timer's delay in 31 bits and cuts a longer one to 1 ms: an
// interval above this is no revalidation, as `0` is.
const MAX_INTERVAL_MS = 2 ** 31 - 1;

export type Credential = { token: string; principal: string } | null;

export type Revalidation = {
  track: (connection: Connection, credential: Credential) => void;
  release: (connection: Connection) => void;
  stop: () => void;
};

export const createRevalidation = (config: Pick<SocketConfig, 'session' | 'revalidateMs'>): Revalidation => {
  const live = new Map<Connection, Credential>();
  const revalidateMs = config.revalidateMs ?? DEFAULT_REVALIDATE_MS;

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

  // A connection whose question is still out is not asked again: a verifier that never answers is asked once for each.
  const asking = new Set<Connection>();

  type Presenting = { connection: Connection; principal: string };

  const question = async (token: string, presenting: readonly Presenting[]): Promise<void> => {
    for (const { connection } of presenting) asking.add(connection);
    try {
      const resolved = await config.session(token);
      for (const { connection, principal } of presenting) if (resolved !== principal && live.has(connection)) expire(connection);
    } finally {
      for (const { connection } of presenting) asking.delete(connection);
    }
  };

  // A pass asks about every token at once, one question for each, and waits for the answers until the next pass is due.
  // One that comes later is acted on when it comes.
  const revalidate = async (): Promise<void> => {
    const byToken = new Map<string, Presenting[]>();
    let asked = 0;
    for (const [connection, credential] of live) {
      if (credential === null || asking.has(connection)) continue;
      asked += 1;
      byToken.set(credential.token, [...(byToken.get(credential.token) ?? []), { connection, principal: credential.principal }]);
    }
    let due: ReturnType<typeof setTimeout> | undefined;
    const passDue = new Promise<false>((resolve) => {
      due = setTimeout(() => resolve(false), revalidateMs);
      due.unref?.();
    });
    const unanswered: unknown[] = [];
    try {
      await Promise.all(
        [...byToken].map(async ([token, presenting]) => {
          const answer = question(token, presenting);
          try {
            if (!(await Promise.race([answer.then(() => true), passDue]))) {
              answer.catch((error: unknown) =>
                console.error('[moss/socket] the session verifier could not be asked about a connection after its pass went on. It stays open and is asked again:', error),
              );
            }
          } catch (error) {
            // An unreachable verifier is not evidence that a session ended: the
            // connection stays, and is asked about again next pass.
            unanswered.push(...presenting.map(() => error));
          }
        }),
      );
    } finally {
      clearTimeout(due);
    }
    if (unanswered.length > 0) {
      console.error(`[moss/socket] the session verifier could not be asked about ${unanswered.length} of ${asked} connection(s). They stay open and are asked again:`, unanswered[0]);
    }
  };

  let passing = false;
  let dueWhilePassing = false;
  const pass = async (): Promise<void> => {
    if (passing) {
      dueWhilePassing = true;
      return;
    }
    passing = true;
    try {
      await revalidate();
    } catch (error) {
      console.error('[moss/socket] a revalidation pass failed, and the next one starts over:', error);
    } finally {
      passing = false;
      if (dueWhilePassing && sweeper !== undefined) {
        dueWhilePassing = false;
        void pass();
      }
    }
  };

  let sweeper: ReturnType<typeof setInterval> | undefined;
  if (revalidateMs > 0 && revalidateMs <= MAX_INTERVAL_MS) {
    sweeper = setInterval(() => void pass(), revalidateMs);
    sweeper.unref?.();
  }

  return {
    track: (connection, credential) => {
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
