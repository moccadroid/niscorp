import type { Connection } from './connection';

// ═══════════════════════════════════════════════════════════════
// THE SHELLS FOR NOBODY ALIVE AT ONCE, and their limit.
//
// Somebody signed in has one shell, however many terminals they open. Nobody
// signed in has a shell for each connection, built for it and disposed with
// it — and a connection costs whoever opens it nothing: no account, no token.
// Unlimited, the memory of the process would be anybody's to fill. So each
// connection for nobody that is served a shell takes a place here, and gives
// it back when it ends. One over the limit is told so and closed
// (`CLOSE_AT_CAPACITY`, ../protocol), and no shell is built for it.
//
// A shell a page builds for somebody SIGNED IN is one for each connection too,
// and takes no place: it takes a credential to open one.
//
// WHAT THE LIMIT IS: ONE COUNT, FOR EVERYBODY WITH NOBODY SIGNED IN, IN ONE
// PROCESS. It bounds what this process holds in memory for them, and that is
// all it does. It is not a limit for each visitor: whoever holds the places
// holds them, so one client that opens as many connections as the limit and
// keeps them has every place, and every other visitor with nobody signed in
// is told `at_capacity` until one of those closes. A process counts its own
// connections: N processes hold N times the limit between them.
//
// WHY NOT ONE FOR EACH ADDRESS. The address a connection comes from is not
// moss's to know: behind a proxy every connection comes from the proxy, and
// which header carries the visitor's is the proxy's to say. A deployment that
// faces the internet limits how many connections one address may hold where
// the address is known, at its proxy or load balancer, on the socket's path;
// this limit is then what keeps the process inside its memory, and is sized
// to that.
// ═══════════════════════════════════════════════════════════════

// THE DEFAULT is the largest round number at which the terminals of nobody, at
// their limit, still fit a process given 512 MB. The per-shell figures it comes
// from are in DOCS.md (`NiscRuntime`, `anonymousShellMax`). A deployment that
// expects more of them at once says so (`runtime.anonymousShellMax`), from
// those numbers and its own memory.
export const DEFAULT_ANONYMOUS_SHELL_MAX = 1000;

export type AnonymousShellLimit = {
  // Take a place for a connection. False: there is none left.
  acquire: (connection: Connection) => boolean;
  // Give it back: the connection ended, or its shell could not be built.
  release: (connection: Connection) => void;
};

export const createAnonymousShellLimit = (max: number): AnonymousShellLimit => {
  // The connections, and not a count of them: giving a place back twice (a
  // refusal, then the close it causes) is then giving it back once.
  const taken = new Set<Connection>();
  return {
    acquire: (connection) => {
      if (taken.size >= max) return false;
      taken.add(connection);
      return true;
    },
    release: (connection) => {
      taken.delete(connection);
    },
  };
};
