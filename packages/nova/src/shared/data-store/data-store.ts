import type { HandlerErrorConfig, Unsubscribe } from '../common';
import type { DataStore } from './types';

export const createDataStore = <T extends Record<string, unknown> = Record<string, unknown>>(
  initial: T,
  config: HandlerErrorConfig = {},
): DataStore<T> => {
  let current: T = { ...initial };
  const subscribers: Array<(data: T) => void> = [];

  const get = (): T => current;

  const update = (updater: (current: T) => T): void => {
    current = updater(current);
    for (const handler of subscribers.slice()) {
      try {
        handler(current);
      } catch (err) {
        config.onHandlerError?.(err);
      }
    }
  };

  const subscribe = (handler: (data: T) => void): Unsubscribe => {
    subscribers.push(handler);
    return (): void => {
      const idx = subscribers.indexOf(handler);
      if (idx >= 0) subscribers.splice(idx, 1);
    };
  };

  return { get, update, subscribe };
};
