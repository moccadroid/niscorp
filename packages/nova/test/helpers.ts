import { createComponentRegistry } from '@layout';
import type { ComponentRegistry } from '@layout';

export const createPermissiveRegistry = (): ComponentRegistry => {
  const inner = createComponentRegistry();
  return {
    register: inner.register,
    registerAll: inner.registerAll,
    get: inner.get,
    list: inner.list,
    has: () => true,
  };
};
