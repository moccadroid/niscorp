import type { VexLive } from '@niscorp/vex';
import type { Unsubscribe } from '@niscorp/nova';

// ═══════════════════════════════════════════════════════════════
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
// ═══════════════════════════════════════════════════════════════

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
