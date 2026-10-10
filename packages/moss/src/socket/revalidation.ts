import { CLOSE_INVALID_TOKEN } from '../protocol';
import type { ServerMessage } from '../protocol';
import type { SocketConfig } from './config';
import type { Connection } from './connection';

// ── Revalidation ──
// The HTTP surfaces re-ask "who is this" on every request; the socket asked
// once, at upgrade, and never again. That asymmetry is why an app could not
// give its tokens an expiry that meant anything: the verifier seam is
// perfectly able to say a token has died (return null), but on a live socket
// nobody was listening for the answer.
//
// It also failed in a shape worth naming. The server shell's own wire rides
// the HTTP middleware carrying the session's token, so an expired credential
// used to leave the socket open and cheerful — frames flowing, screen alive —
// while every endpoint the shell called came back 401. A live interface whose
// every load silently fails is strictly worse than a lock screen.
//
// The recovery for this already existed and is untouched: a `4401` close is a
// recovery, not a retry, and the terminal drops its token and reconnects
// anonymous onto the served lock screen. All that was missing was something
// asking the question. This is that.
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
  // anonymous, which has nothing that can expire). One structure: the future
  // catalog-push fan-out wants the keys, revalidation wants the values.
  const live = new Map<Connection, Credential>();

  const expire = (connection: Connection): void => {
    // Diagnostics before authority, as at upgrade — the close code is what
    // the terminal acts on; this is what a person reads in a log.
    connection.send(JSON.stringify({ type: 'error', code: 'invalid_token', message: 'The session token no longer resolves to this principal.' } satisfies ServerMessage));
    connection.close(CLOSE_INVALID_TOKEN, 'session expired');
    live.delete(connection);
  };

  const revalidate = async (): Promise<void> => {
    for (const [connection, credential] of [...live]) {
      if (credential === null) continue; // anonymous — nothing to expire
      let resolved: string | null;
      try {
        resolved = await config.session(credential.token);
      } catch {
        // The verifier is unreachable — a database blip, a network hiccup.
        // That is not evidence a session ended, and signing everybody out on
        // it would turn a transient fault into an outage. Ask again next pass.
        continue;
      }
      // Unchanged is the overwhelmingly common answer. A token that stops
      // resolving has expired or been revoked; one that resolves to somebody
      // ELSE is not the session that attached, and both are the same close.
      if (resolved === credential.principal) continue;
      if (!live.has(connection)) continue; // it closed while we were awaiting
      expire(connection);
    }
  };

  const revalidateMs = config.revalidateMs ?? DEFAULT_REVALIDATE_MS;
  let sweeper: ReturnType<typeof setInterval> | undefined;
  if (revalidateMs > 0 && Number.isFinite(revalidateMs)) {
    sweeper = setInterval(() => void revalidate(), revalidateMs);
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
