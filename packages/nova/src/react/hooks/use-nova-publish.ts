import { useContext } from 'react';
import { NovaRenderContext } from '../context';
import type { NovaPublish } from '../types';

export const useNovaPublish = (): NovaPublish => {
  const ctx = useContext(NovaRenderContext);
  if (ctx === undefined) {
    throw new Error('useNovaPublish must be used inside <NovaRenderProvider>');
  }
  return ctx.publish;
};
