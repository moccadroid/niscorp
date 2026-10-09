import { AsyncLocalStorage } from 'node:async_hooks';
import type { WriteEvent } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// THE WRITE LANE — every write a request makes, offered to whoever subscribes.
//
// Vex is the one door a write passes, and it reports each committed mutation
// once: the statements that ran, the rows the database returned, and the scope
// the request could not forge. What is done with that news is not this
// module's business. It hands the event on, with the one thing only the
// request knew: where in a chain of effects the caller said it was.
// ═══════════════════════════════════════════════════════════════

// THE CHAIN POSITION A REQUEST NAMED. A tide effect writing back through vex
// names its position in two headers (./routes.ts). Untrusted as it stands:
// whoever hears it decides whether that caller's word is good.
export type ChainHints = { cause: string; depth: number };

// Told once for each committed mutation, after the commit: what vex reports,
// and the chain position of the request that wrote, when it named one.
export type WriteListener = (event: WriteEvent, chain: ChainHints | undefined) => void;

export type WriteLane = {
  // Hear every write the routes serve. Returns the way to stop hearing.
  subscribe: (listener: WriteListener) => () => void;
  // Run a request inside the chain position it named. The position rides an
  // AsyncLocalStorage context, so the observer, which fires deep inside vex's
  // handler and far from any request object, can read it without vex ever
  // learning that chains exist.
  within: <Ran>(chain: ChainHints, run: () => Ran) => Ran;
  // What vex is handed as its write observer.
  report: (event: WriteEvent) => void;
};

export const createWriteLane = (): WriteLane => {
  const position = new AsyncLocalStorage<ChainHints>();
  const listeners = new Set<WriteListener>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    within: (chain, run) => position.run(chain, run),
    // IN THE ORDER THEY SUBSCRIBED, and not kept apart: a listener that throws
    // ends the telling of that write, and vex, which called, logs the throw
    // and answers the request as written. The one observer this lane replaced
    // behaved so, and nothing has decided otherwise.
    report: (event) => {
      const chain = position.getStore();
      for (const listener of [...listeners]) listener(event, chain);
    },
  };
};
