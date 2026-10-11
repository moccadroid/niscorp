import { AsyncLocalStorage } from 'node:async_hooks';
import type { VexLive, WriteEvent } from '@niscorp/vex';
import type { Unsubscribe } from '@niscorp/nova';

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

// A SHELL'S READ THAT KEEPS ANSWERING.
//
// A server shell reads vex through the session's wire — an in-process
// request against this server's own mounts. For an entry with
// `refresh: 'reactive'`, vex can keep answering that read after it returned:
// every committed write to a table the query reads, it refetches (once for
// everybody who would get the same rows) and calls back with the caller's
// new answer if it changed.
//
// This is the seam between the two halves. Toward vex it is a `VexLive` —
// a signal and a callback, carried in the in-process request's env where no
// network request can reach. Toward nova it is the response's `onChange`:
// nova applies each later body exactly as it applied the first (`response`,
// then `target`) and never learns why it came. Nothing else in moss knows.
//
// Lifetime is the caller's. The follow ends when the call's own signal
// aborts (nova aborts it when the instance unmounts), when the last
// subscriber unsubscribes (nova does that when a newer call to the same
// endpoint lands), or — for a caller that never subscribes at all, like a
// server function reading through the wire — as soon as the response has
// been handed over and nobody took it up.

export type WireFollower = {
  // Handed to vex with the request.
  live: VexLive;
  // Offered to the caller on the response.
  onChange: (handler: (body: unknown) => void) => Unsubscribe;
  // The response has been handed over: a follow nobody took up ends now.
  handedOver: () => void;
  // The read did not succeed: there is nothing to follow.
  end: () => void;
};

export const createWireFollower = (callSignal: AbortSignal): WireFollower => {
  const controller = new AbortController();
  const end = (): void => {
    controller.abort();
  };
  if (callSignal.aborted) end();
  else callSignal.addEventListener('abort', end, { once: true });

  const handlers = new Set<(body: unknown) => void>();
  // An answer that changed between the response and the first subscriber —
  // a write landing in that gap — is held and handed over on subscribe,
  // after the caller has applied the first body. Only the newest is kept.
  let missed: { body: unknown } | undefined;

  const live: VexLive = {
    signal: controller.signal,
    onChange: (response) => {
      if (handlers.size === 0) {
        missed = { body: response.result };
        return;
      }
      for (const handler of [...handlers]) handler(response.result);
    },
  };

  const onChange = (handler: (body: unknown) => void): Unsubscribe => {
    if (controller.signal.aborted) return () => {};
    handlers.add(handler);
    if (missed !== undefined) {
      const { body } = missed;
      missed = undefined;
      handler(body);
    }
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) end();
    };
  };

  // The caller's own continuation — parse, shape, write the first body,
  // subscribe — runs in microtasks after the response resolves; a macrotask
  // later, anybody who meant to follow has.
  const handedOver = (): void => {
    setTimeout(() => {
      if (handlers.size === 0) end();
    }, 0);
  };

  return { live, onChange, handedOver, end };
};
