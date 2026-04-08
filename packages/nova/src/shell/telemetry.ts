import type { Unsubscribe } from '../shared/common';
import type {
  DataChangeEvent,
  DataChangeHandler,
  ShellTelemetry,
  StateChangeHandler,
  StateSnapshot,
} from './types';

export type Telemetry = {
  fireStateChange: (snapshot: StateSnapshot) => void;
  fireDataChange: (change: DataChangeEvent) => void;
  onStateChange: (handler: StateChangeHandler) => Unsubscribe;
  onDataChange: (handler: DataChangeHandler) => Unsubscribe;
  clear: () => void;
};

const safeCall = <T>(fn: ((arg: T) => void) | undefined, arg: T): void => {
  if (fn === undefined) return;
  try {
    fn(arg);
  } catch {
    // telemetry handlers must not crash the shell
  }
};

export const createTelemetry = (config: ShellTelemetry | undefined): Telemetry => {
  const stateSubscribers: StateChangeHandler[] = [];
  const dataSubscribers: DataChangeHandler[] = [];

  const fireStateChange = (snapshot: StateSnapshot): void => {
    safeCall(config?.onStateChange, snapshot);
    for (const handler of stateSubscribers.slice()) safeCall(handler, snapshot);
  };

  const fireDataChange = (change: DataChangeEvent): void => {
    safeCall(config?.onDataChange, change);
    for (const handler of dataSubscribers.slice()) safeCall(handler, change);
  };

  const onStateChange = (handler: StateChangeHandler): Unsubscribe => {
    stateSubscribers.push(handler);
    return (): void => {
      const idx = stateSubscribers.indexOf(handler);
      if (idx >= 0) stateSubscribers.splice(idx, 1);
    };
  };

  const onDataChange = (handler: DataChangeHandler): Unsubscribe => {
    dataSubscribers.push(handler);
    return (): void => {
      const idx = dataSubscribers.indexOf(handler);
      if (idx >= 0) dataSubscribers.splice(idx, 1);
    };
  };

  const clear = (): void => {
    stateSubscribers.length = 0;
    dataSubscribers.length = 0;
  };

  return { fireStateChange, fireDataChange, onStateChange, onDataChange, clear };
};
