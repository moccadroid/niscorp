import { useMemo, type FC, type ReactNode } from 'react';
import type { ComponentRegistry } from '@layout';
import type { Shell } from '@shell';
import { NovaRenderContext, NovaShellContext, type NovaRenderContextValue } from './context';
import type { NovaComponent, NovaDispatch, NovaPublish } from './types';

const noopDispatch: NovaDispatch = () => {};
const noopPublish: NovaPublish = () => {};

// ═══════════════════════════════════════════════════════════
// <NovaRenderProvider>
//
// The framework-agnostic renderer context. Pairs a component
// registry with a dispatch and publish function. Works with no
// shell — dispatch and publish default to no-ops so static
// layouts can be rendered without any event infrastructure.
// ═══════════════════════════════════════════════════════════

export type NovaRenderProviderProps = {
  registry: ComponentRegistry<NovaComponent>;
  dispatch?: NovaDispatch;
  publish?: NovaPublish;
  children?: ReactNode;
};

export const NovaRenderProvider: FC<NovaRenderProviderProps> = ({
  registry,
  dispatch = noopDispatch,
  publish = noopPublish,
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
// shell via context. The registry defaults to `shell.registry` so
// callers don't have to thread it through twice; pass an explicit
// `registry` override only when the shell should render against a
// different one (rare).
// ═══════════════════════════════════════════════════════════

export type NovaShellProviderProps = {
  shell: Shell;
  registry?: ComponentRegistry<NovaComponent>;
  children?: ReactNode;
};

export const NovaShellProvider: FC<NovaShellProviderProps> = ({ shell, registry, children }) => {
  const dispatch = useMemo<NovaDispatch>(() => (event) => shell.dispatch(event), [shell]);
  const publish = useMemo<NovaPublish>(
    () => (channel, payload) => shell.publish(channel, payload),
    [shell],
  );
  const resolvedRegistry = (registry ?? shell.registry) as ComponentRegistry<NovaComponent>;
  return (
    <NovaShellContext.Provider value={shell}>
      <NovaRenderProvider registry={resolvedRegistry} dispatch={dispatch} publish={publish}>
        {children}
      </NovaRenderProvider>
    </NovaShellContext.Provider>
  );
};
