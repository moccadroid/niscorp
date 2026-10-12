import { AsyncLocalStorage } from 'node:async_hooks';
import type { VexLive, WriteEvent } from '@niscorp/vex';
import type { Unsubscribe } from '@niscorp/nova';

export type WriteRequest = { header: (name: string) => string | undefined };

export type WriteListener = (event: WriteEvent, request: WriteRequest) => void;

// Never handed to a listener: one hears every write the routes serve, and
// would be handed the session of everybody who writes.
const CREDENTIALS: ReadonlySet<string> = new Set(['authorization', 'cookie', 'proxy-authorization']);

export const writeRequestOf = (header: (name: string) => string | undefined): WriteRequest => ({
  header: (name) => (CREDENTIALS.has(name.toLowerCase()) ? undefined : header(name)),
});

const SAID_NOTHING: WriteRequest = { header: () => undefined };

export type WriteNotifier = {
  subscribe: (listener: WriteListener) => () => void;
  within: <Ran>(request: WriteRequest, run: () => Ran) => Ran;
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

export type WireFollower = {
  live: VexLive;
  onChange: (handler: (body: unknown) => void) => Unsubscribe;
  handedOver: () => void;
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

  // The caller's continuation, which subscribes, runs in microtasks after the
  // response resolves: one macrotask later, anybody who meant to follow has.
  const handedOver = (): void => {
    setTimeout(() => {
      if (handlers.size === 0) end();
    }, 0);
  };

  return { live, onChange, handedOver, end };
};
