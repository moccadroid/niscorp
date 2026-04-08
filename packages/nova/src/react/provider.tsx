import { useMemo, type FC, type ReactNode } from 'react';
import type { ComponentRegistry } from '@layout';
import type { Shell } from '@shell';
import { NovaRenderContext, NovaShellContext, type NovaRenderContextValue } from './context';
import type { NovaComponent, NovaDispatch, NovaPublish } from './types';

// ═══════════════════════════════════════════════════════════
// <NovaRenderProvider>
//
// The framework-agnostic renderer context. Pairs a component
// registry with a dispatch and publish function. Works with no
// shell — callers can pass a no-op dispatch/publish to render a
// static layout against arbitrary data.
// ═══════════════════════════════════════════════════════════

export type NovaRenderProviderProps = {
  registry: ComponentRegistry<NovaComponent>;
  dispatch: NovaDispatch;
  publish: NovaPublish;
  children?: ReactNode;
};

export const NovaRenderProvider: FC<NovaRenderProviderProps> = ({
  registry,
  dispatch,
  publish,
  children,
}) => {
  const value = useMemo<NovaRenderContextValue>(
    () => ({ registry, dispatch, publish }),
    [registry, dispatch, publish],
  );
  return <NovaRenderContext.Provider value={value}>{children}</NovaRenderContext.Provider>;
};

// ═══════════════════════════════════════════════════════════
// <NovaShellProvider>
//
// A thin wrapper over <NovaRenderProvider> that also exposes the
// shell via context. Consumers pass BOTH the shell and the
// registry explicitly — the shell does not own the registry.
// ═══════════════════════════════════════════════════════════

export type NovaShellProviderProps = {
  shell: Shell;
  registry: ComponentRegistry<NovaComponent>;
  children?: ReactNode;
};

export const NovaShellProvider: FC<NovaShellProviderProps> = ({ shell, registry, children }) => {
  const dispatch = useMemo<NovaDispatch>(() => (event) => shell.dispatch(event), [shell]);
  const publish = useMemo<NovaPublish>(
    () => (channel, payload) => shell.publish(channel, payload),
    [shell],
  );
  return (
    <NovaShellContext.Provider value={shell}>
      <NovaRenderProvider registry={registry} dispatch={dispatch} publish={publish}>
        {children}
      </NovaRenderProvider>
    </NovaShellContext.Provider>
  );
};
