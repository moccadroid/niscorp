import type { Unsubscribe } from '../common';
import type { ChannelHandler, MessageBus } from './types';

// ═══════════════════════════════════════════════════════════
// Pure channel-based message bus. Internal subscriber map;
// does NOT depend on the event bus.
// ═══════════════════════════════════════════════════════════

export const createMessageBus = (): MessageBus => {
  const handlers = new Map<string, ChannelHandler[]>();

  const dispatch = (channel: string, payload: unknown, from: string | undefined): void => {
    const list = handlers.get(channel);
    if (list === undefined) return;
    for (const handler of list.slice()) {
      try {
        handler(payload, from);
      } catch {
        // handler errors must not crash the bus
      }
    }
  };

  const publish = (channel: string, payload?: unknown): void => {
    dispatch(channel, payload, undefined);
  };

  const send = (from: string, to: string, payload?: unknown): void => {
    dispatch(to, payload, from);
  };

  const subscribe = (channel: string, handler: ChannelHandler): Unsubscribe => {
    const list = handlers.get(channel) ?? [];
    list.push(handler);
    handlers.set(channel, list);
    return (): void => {
      const current = handlers.get(channel);
      if (current === undefined) return;
      const idx = current.indexOf(handler);
      if (idx >= 0) current.splice(idx, 1);
    };
  };

  return { publish, send, subscribe };
};
