import type { ActionRuntime } from '../action';
import type { Unsubscribe } from '../shared/common';

export type RuntimeRegistry = {
  register: (runtime: ActionRuntime, onData: (data: Record<string, unknown>) => void) => void;
  unregister: (instanceId: string) => void;
  get: (instanceId: string) => ActionRuntime | undefined;
  disposeAll: () => void;
};

export const createRuntimeRegistry = (): RuntimeRegistry => {
  const runtimes = new Map<string, ActionRuntime>();
  const unsubs = new Map<string, Unsubscribe>();

  const register = (
    runtime: ActionRuntime,
    onData: (data: Record<string, unknown>) => void,
  ): void => {
    const id = runtime.instance.id;
    runtimes.set(id, runtime);
    unsubs.set(id, runtime.onDataChange(onData));
  };

  const unregister = (instanceId: string): void => {
    const off = unsubs.get(instanceId);
    if (off !== undefined) off();
    unsubs.delete(instanceId);
    runtimes.delete(instanceId);
  };

  const get = (instanceId: string): ActionRuntime | undefined => runtimes.get(instanceId);

  const disposeAll = (): void => {
    for (const off of unsubs.values()) off();
    unsubs.clear();
    runtimes.clear();
  };

  return { register, unregister, get, disposeAll };
};
