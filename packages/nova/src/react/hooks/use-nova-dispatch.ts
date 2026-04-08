import { useContext } from 'react';
import { NovaRenderContext } from '../context';
import type { NovaDispatch } from '../types';

export const useNovaDispatch = (): NovaDispatch => {
  const ctx = useContext(NovaRenderContext);
  if (ctx === undefined) {
    throw new Error('useNovaDispatch must be used inside <NovaRenderProvider>');
  }
  return ctx.dispatch;
};
