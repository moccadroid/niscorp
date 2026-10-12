import { inject } from 'vue';
import type { ComponentRegistry } from '@layout';
import type { Shell } from '@shell';
import { NovaRenderKey, NovaShellKey, type NovaRenderContextValue, type NovaShellSource, type SlotWrapper } from '../context';
import type { NovaDispatch, NovaPublish } from '../types';

// dispatch and publish are read off the context on every call: a provider whose
// dispatch changes (a scoped slot, a swapped shell) is honoured without a new setup.

const renderContext = (caller: string): NovaRenderContextValue => {
  const ctx = inject(NovaRenderKey, undefined);
  if (ctx === undefined) throw new Error(`${caller} must be used inside <NovaRenderProvider>`);
  return ctx;
};

export const useNovaDispatch = (): NovaDispatch => {
  const ctx = renderContext('useNovaDispatch');
  return (event) => ctx.dispatch(event);
};

export const useNovaPublish = (): NovaPublish => {
  const ctx = renderContext('useNovaPublish');
  return (channel, payload) => ctx.publish(channel, payload);
};

export const useNovaRegistry = (): ComponentRegistry => renderContext('useNovaRegistry').registry;

export const useSlotWrapper = (): SlotWrapper | undefined => inject(NovaRenderKey, undefined)?.slotWrapper;

export const useShellSource = (): NovaShellSource => {
  const source = inject(NovaShellKey, undefined);
  if (source === undefined) throw new Error('useShell must be used inside <NovaShellProvider>');
  return source;
};

export const useShell = (): Shell => useShellSource().shell;
