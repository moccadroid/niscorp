import { useContext } from 'react';
import type { ComponentRegistry } from '@layout';
import { NovaRenderContext } from '../context';
import type { NovaComponent } from '../types';

export const useNovaRegistry = (): ComponentRegistry<NovaComponent> => {
  const ctx = useContext(NovaRenderContext);
  if (ctx === undefined) {
    throw new Error('useNovaRegistry must be used inside <NovaRenderProvider>');
  }
  return ctx.registry;
};
