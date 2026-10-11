import { CLOSE_INVALID_TOKEN } from '../protocol';
import type { ServerMessage } from '../protocol';
import type { Connection, SocketConfig } from './types';

// ── Revalidation ──
// The HTTP surfaces re-ask "who is this" on every request; the socket asks at
// upgrade and then on this timer. The verifier seam can say a token has died
// (return null), and on a live socket something has to be listening for the
// answer: the server shell's own wire rides the HTTP middleware carrying the
// session's token, so an expired credential would leave the socket open —
// frames flowing, screen alive — while every endpoint the shell called came
// back 401. A live interface whose every load silently fails is strictly worse
// than a lock screen.
//
// A `4401` close is a recovery, not a retry: the terminal drops its token and
// reconnects anonymous onto the served lock screen.
export const DEFAULT_REVALIDATE_MS = 60 * 1000;

// What a connection was admitted on: the token it carried and who that was.
// `null` is nobody signed in, which has nothing that can expire.
export type Credential = { token: string; principal: string } | null;

export type Revalidation = {
  // Remember a connection WITH its credential — revalidation has to re-ask the
  // same question the connection was admitted on, and the token is not
  // recoverable from anything else here.
  hold: (connection: Connection, credential: Credential) => void;
  // The connection ended, or was never admitted.
  release: (connection: Connection) => void;
  // End the timer.
  stop: () => void;
};

export const createRevalidation = (config: Pick<SocketConfig, 'session' | 'revalidateMs'>): Revalidation => {
  // Every live connection, with the credential it authenticated under (null =
  // anonymous, which has nothing that can expire).
  const live = new Map<Connection, Credential>();

  const expire = (connection: Connection): void => {
    // Forgotten FIRST. A connection that is half gone may throw when it is
    // told, and one still in the map is asked about, and told, on every pass
    // after this one.
    live.delete(connection);
    // Diagnostics before authority, as at upgrade — the close code is what
    // the terminal acts on; this is what a person reads in a log.
    const told = (): void => connection.send(JSON.stringify({ type: 'error', code: 'invalid_token', message: 'The session token no longer resolves to this principal.' } satisfies ServerMessage));
    const closed = (): void => connection.close(CLOSE_INVALID_TOKEN, 'session expired');
    // Each on its own, so a connection that cannot be told is closed all the
    // same. And nothing leaves a pass: it runs off a timer, where a throw is
    // an unhandled rejection and Node ends the process, and the connections
    // after this one are still to be asked about.
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
      if (credential === null) continue; // anonymous — nothing to expire
      asked += 1;
      let resolved: string | null;
      try {
        resolved = await config.session(credential.token);
      } catch (error) {
        // The verifier is unreachable — a database blip, a network hiccup.
        // That is not evidence a session ended, and signing everybody out on
        // it would turn a transient fault into an outage. Ask again next pass.
        unanswered.push(error);
        continue;
      }
      // Unchanged is the overwhelmingly common answer. A token that stops
      // resolving has expired or been revoked; one that resolves to somebody
      // ELSE is not the session that attached, and both are the same close.
      if (resolved === credential.principal) continue;
      if (!live.has(connection)) continue; // it closed while we were awaiting
      expire(connection);
    }
    // SAID, once for the pass and not once for each connection: with the
    // verifier down that would be a line for everybody signed in, every pass.
    // The first error stands for the rest; they are one outage.
    if (unanswered.length > 0) {
      console.error(`[moss/socket] the session verifier could not be asked about ${unanswered.length} of ${asked} connection(s). They stay open and are asked again:`, unanswered[0]);
    }
  };

  // ONE PASS AT A TIME. A pass asks about every connection in turn, and takes
  // as long as the verifier does. The timer does not wait for it: a pass begun
  // while one is still asking would double what a slow verifier is asked, and
  // the one after that triple it. A pass that is due while one runs is skipped;
  // the next tick asks again.
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
  if (revalidateMs > 0 && Number.isFinite(revalidateMs)) {
    sweeper = setInterval(() => void pass(), revalidateMs);
    // Revalidation must never be the reason a process stays alive.
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
