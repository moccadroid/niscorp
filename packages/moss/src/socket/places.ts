import type { Connection } from './connection';

// ═══════════════════════════════════════════════════════════════
// THE SHELLS FOR NOBODY ALIVE AT ONCE, and their limit.
//
// Somebody signed in has one shell, however many terminals they open. Nobody
// signed in has a shell for each connection, built for it and disposed with
// it — and a connection costs whoever opens it nothing: no account, no token.
// Unlimited, the memory of the process was anybody's to fill. So each
// connection for nobody that is served a shell takes a place here, and gives
// it back when it ends. One over the limit is told so and closed
// (`CLOSE_AT_CAPACITY`, ../protocol), and no shell is built for it.
//
// A shell a page builds for somebody SIGNED IN is one for each connection too,
// and takes no place: it takes a credential to open one.
// ═══════════════════════════════════════════════════════════════

// THE DEFAULT, FROM A MEASUREMENT (2026-10-10, Node 24, this repository).
//
// Lyceum's real boot, 2,000 connections for nobody opened through
// `server.socket` and held, the heap read after a forced collection before
// and after, with a transport that drops the frames it is sent (so what is
// counted is what the server keeps for one: its shell, the frames it last
// sent, the socket's own record):
//
//   heap used      52.5 KB for each shell   (6.7 KB of that screen as JSON)
//   resident size  about 110 KB for each
//
// The same through this module and a shell host alone, for an app of one
// canvas and one action: 26.7 KB of heap for each, all of it given back when
// the connections close. That is the floor; lyceum's lock screen is a small
// screen.
//
// On top of a shell the Node transport holds about 260 KB resident for each
// connection while compression is on, which is its default (DOCS.md
// § Compression).
//
// At 1,000: about 53 MB of heap and 110 MB resident in shells, about 370 MB
// resident with the transport's compression. That is the largest round number
// at which the terminals of nobody, at their limit, still fit a process given
// 512 MB. A deployment that expects more of them at once says so
// (`runtime.anonymousShellMax`), from those numbers and its own memory.
export const DEFAULT_ANONYMOUS_SHELL_MAX = 1000;

export type Places = {
  // Take a place for a connection. False: there is none left.
  take: (connection: Connection) => boolean;
  // The connection ended, or its shell could not be built.
  give: (connection: Connection) => void;
};

export const createPlaces = (max: number): Places => {
  // The connections, and not a count of them: giving a place back twice (a
  // refusal, then the close it causes) is then giving it back once.
  const taken = new Set<Connection>();
  return {
    take: (connection) => {
      if (taken.size >= max) return false;
      taken.add(connection);
      return true;
    },
    give: (connection) => {
      taken.delete(connection);
    },
  };
};
