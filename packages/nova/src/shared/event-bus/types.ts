import type { Unsubscribe } from '../common';
import type { NovaEvent } from './schemas';

export type { NovaEvent };
export type { Unsubscribe };

export type EventHandler<TEvent extends { type: string } = NovaEvent> = (event: TEvent) => void;

export type EventMatcher = string | RegExp;

export type EventBus<TEvent extends { type: string } = NovaEvent> = {
  emit: (event: TEvent) => void;
  on: (matcher: EventMatcher, handler: EventHandler<TEvent>) => Unsubscribe;
  once: (matcher: EventMatcher, handler: EventHandler<TEvent>) => Unsubscribe;
  scoped: () => EventBus<TEvent>;
};
