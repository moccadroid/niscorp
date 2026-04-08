import type { Unsubscribe } from '../common';
import type { EventBus, EventHandler, EventMatcher } from './types';
import type { NovaEvent } from './schemas';

// ═══════════════════════════════════════════════════════════
// Typed event bus. Factory function.
//
// Generic over TEvent (a discriminated union of events, defaulting
// to NovaEvent). The bus only ever inspects `event.type` for matching.
//
// `scoped()` returns a child bus that forwards every event it emits
// to its parent. No type mangling, no string prefixing — if you want
// namespacing, put it in your event payload.
// ═══════════════════════════════════════════════════════════

type Subscription<TEvent extends { type: string }> = {
  matcher: EventMatcher;
  handler: EventHandler<TEvent>;
};

const typeMatches = (matcher: EventMatcher, type: string): boolean => {
  if (typeof matcher === 'string') return matcher === type;
  return matcher.test(type);
};

const createChildBus = <TEvent extends { type: string }>(
  parent: EventBus<TEvent> | undefined,
): EventBus<TEvent> => {
  const subscriptions: Subscription<TEvent>[] = [];

  const emit = (event: TEvent): void => {
    for (const sub of subscriptions.slice()) {
      if (!typeMatches(sub.matcher, event.type)) continue;
      try {
        sub.handler(event);
      } catch {
        // handler failures must not crash the bus
      }
    }
    if (parent !== undefined) parent.emit(event);
  };

  const on = (matcher: EventMatcher, handler: EventHandler<TEvent>): Unsubscribe => {
    const sub: Subscription<TEvent> = { matcher, handler };
    subscriptions.push(sub);
    return (): void => {
      const idx = subscriptions.indexOf(sub);
      if (idx >= 0) subscriptions.splice(idx, 1);
    };
  };

  const once = (matcher: EventMatcher, handler: EventHandler<TEvent>): Unsubscribe => {
    const off = on(matcher, (event) => {
      off();
      handler(event);
    });
    return off;
  };

  const bus: EventBus<TEvent> = {
    emit,
    on,
    once,
    scoped: () => createChildBus<TEvent>(bus),
  };

  return bus;
};

export const createEventBus = <
  TEvent extends { type: string } = NovaEvent,
>(): EventBus<TEvent> => createChildBus<TEvent>(undefined);
