import { AsyncLocalStorage } from 'node:async_hooks';
import type { WriteEvent } from '@niscorp/vex';

// ═══════════════════════════════════════════════════════════════
// THE WRITE LANE — every write a request makes, offered to whoever subscribes.
//
// Vex is the one door a write passes, and it reports each committed mutation
// once: the statements that ran, the rows the database returned, and the scope
// the request could not forge. What is done with that news is not this
// module's business. It hands the event on, with what only the request knew:
// what it said in its headers.
// ═══════════════════════════════════════════════════════════════

// WHAT THE REQUEST THAT WROTE SAID IN ITS HEADERS, asked by name. This module
// reads none of them and knows none by name: a header is the business of
// whoever hears the write and asks for it (the feature that mints a write into
// tide reads the two a tide effect sends). Untrusted as it stands: it is the
// caller's word, and whoever asks decides whether that caller's word is good.
// Who wrote is not asked here. It is the event's scope, which the request
// could not forge.
export type WriteRequest = { header: (name: string) => string | undefined };

// Told once for each committed mutation, after the commit: what vex reports,
// and what the request that wrote said.
export type WriteListener = (event: WriteEvent, request: WriteRequest) => void;

// THE CREDENTIAL A REQUEST CARRIED IS NOT HANDED ON. A listener hears every
// write the routes serve, so one that could ask for `Authorization` would be
// handed the session of everybody who writes.
const CREDENTIALS: ReadonlySet<string> = new Set(['authorization', 'cookie', 'proxy-authorization']);

// What a request said, from how one of its headers is read.
export const writeRequestOf = (header: (name: string) => string | undefined): WriteRequest => ({
  header: (name) => (CREDENTIALS.has(name.toLowerCase()) ? undefined : header(name)),
});

// A write no request made says nothing.
const SAID_NOTHING: WriteRequest = { header: () => undefined };

export type WriteNotifier = {
  // Hear every write the routes serve. Returns the way to stop hearing.
  subscribe: (listener: WriteListener) => () => void;
  // Run a request with what it said kept for whoever hears a write it makes.
  // It rides an AsyncLocalStorage context, so the observer, which fires deep
  // inside vex's handler and far from any request object, can read it without
  // vex ever being handed a request.
  within: <Ran>(request: WriteRequest, run: () => Ran) => Ran;
  // What vex is handed as its write observer.
  report: (event: WriteEvent) => void;
};

export const createWriteNotifier = (): WriteNotifier => {
  const requests = new AsyncLocalStorage<WriteRequest>();
  const listeners = new Set<WriteListener>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    within: (request, run) => requests.run(request, run),
    // IN THE ORDER THEY SUBSCRIBED, AND EACH ON ITS OWN. The write is done by
    // the time anybody is told, and what one listener makes of it is nothing
    // to the next. So a throw is logged here and the rest are told; nothing
    // reaches vex, which answers the request as written either way.
    report: (event) => {
      const request = requests.getStore() ?? SAID_NOTHING;
      for (const listener of [...listeners]) {
        try {
          listener(event, request);
        } catch (error) {
          console.error(`[moss:writes] somebody told of the write "${event.fingerprint}" failed. The others are still told:`, error);
        }
      }
    },
  };
};
