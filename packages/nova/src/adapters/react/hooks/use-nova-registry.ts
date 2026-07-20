import { useContext } from 'react';
import type { ComponentRegistry } from '@layout';
import { NovaRenderContext } from '../context';
import type { NovaComponent } from '../types';

// Returns the component registry exposed via <NovaRenderProvider>.
// Useful for components that need to introspect or look up other
// registered components (for agent tooling, dev inspectors, etc).
export const useNovaRegistry = (): ComponentRegistry<NovaComponent> => {
  const ctx = useContext(NovaRenderContext);
  if (ctx === undefined) {
    throw new Error('useNovaRegistry must be used inside <NovaRenderProvider>');
  }
  return ctx.registry;
};
