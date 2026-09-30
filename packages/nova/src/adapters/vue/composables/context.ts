import { inject } from 'vue';
import type { ComponentRegistry } from '@layout';
import type { Shell } from '@shell';
import { NovaRenderKey, NovaShellKey, type NovaRenderContextValue, type NovaShellSource, type SlotWrapper } from '../context';
import type { NovaDispatch, NovaPublish } from '../types';

// ═══════════════════════════════════════════════════════════
// The render-context composables. Call them in setup (or a functional
// component's render). dispatch / publish come back as stable functions that
// read the provider's CURRENT value on every call, so a provider whose
// dispatch changes (a scoped slot, a swapped shell) is honoured without the
// component re-running setup.
// ═══════════════════════════════════════════════════════════

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

// The component registry exposed via <NovaRenderProvider> — for components
// that introspect or look up other registered components (agent tooling,
// dev inspectors).
export const useNovaRegistry = (): ComponentRegistry => renderContext('useNovaRegistry').registry;

// The optional app-supplied slotWrapper; undefined when none was provided (or
// outside a provider). Never throws: a missing wrapper is the common case.
export const useSlotWrapper = (): SlotWrapper | undefined => inject(NovaRenderKey, undefined)?.slotWrapper;

// The shell source — the subscribing composables read `.shell` inside a watch
// so a swapped shell resubscribes.
export const useShellSource = (): NovaShellSource => {
  const source = inject(NovaShellKey, undefined);
  if (source === undefined) throw new Error('useShell must be used inside <NovaShellProvider>');
  return source;
};

export const useShell = (): Shell => useShellSource().shell;
