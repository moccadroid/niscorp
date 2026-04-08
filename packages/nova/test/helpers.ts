import { createComponentRegistry } from '@layout';
import type { ComponentRegistry } from '@layout';

// ═══════════════════════════════════════════════════════════
// Test helper: a component registry that accepts any component
// name. Most test fixtures use bare component nodes like
// `{ component: 'Text' }` without registering a concrete
// implementation — the renderer only needs the name to round-trip
// through RenderNode. This wraps a real registry with an always-
// true `has`, so tests do not have to pre-register every primitive
// they reference.
// ═══════════════════════════════════════════════════════════

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
