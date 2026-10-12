import { useMemo, type ComponentType, type FC, type ReactNode } from 'react';
import type { ComponentRegistry } from '@layout';
import type { Shell } from '@shell';
import {
  NovaRenderContext,
  NovaShellContext,
  type NovaRenderContextValue,
  type SlotWrapper,
} from './context';
import { ShellHeadProvider } from './head';
import type { NovaComponent, NovaDispatch, NovaPublish } from './types';

const noopDispatch: NovaDispatch = () => {};
const noopPublish: NovaPublish = () => {};

export type NovaRenderProviderProps = {
  registry: ComponentRegistry<NovaComponent>;
  dispatch?: NovaDispatch;
  publish?: NovaPublish;
  slotWrapper?: SlotWrapper;
  fallback?: NovaComponent;
  textWrapper?: ComponentType<{ children?: ReactNode }>;
  errorMarker?: ComponentType<{ code: string; message: string }>;
  children?: ReactNode;
};

export const NovaRenderProvider: FC<NovaRenderProviderProps> = ({
  registry,
  dispatch = noopDispatch,
  publish = noopPublish,
  slotWrapper,
  fallback,
  textWrapper,
  errorMarker,
  children,
}) => {
  const value = useMemo<NovaRenderContextValue>(
    () => ({ registry, dispatch, publish, slotWrapper, fallback, textWrapper, errorMarker }),
    [registry, dispatch, publish, slotWrapper, fallback, textWrapper, errorMarker],
  );
  return <NovaRenderContext.Provider value={value}>{children}</NovaRenderContext.Provider>;
};

export type NovaShellProviderProps = {
  shell: Shell;
  registry?: ComponentRegistry<NovaComponent>;
  slotWrapper?: SlotWrapper;
  children?: ReactNode;
};

export const NovaShellProvider: FC<NovaShellProviderProps> = ({
  shell,
  registry,
  slotWrapper,
  children,
}) => {
  const dispatch = useMemo<NovaDispatch>(() => (event) => shell.dispatch(event), [shell]);
  const publish = useMemo<NovaPublish>(
    () => (channel, payload) => shell.publish(channel, payload),
    [shell],
  );
  const resolvedRegistry = (registry ?? shell.registry) as ComponentRegistry<NovaComponent>;
  return (
    <NovaShellContext.Provider value={shell}>
      <NovaRenderProvider
        registry={resolvedRegistry}
        dispatch={dispatch}
        publish={publish}
        slotWrapper={slotWrapper}
      >
        <ShellHeadProvider shell={shell}>{children}</ShellHeadProvider>
      </NovaRenderProvider>
    </NovaShellContext.Provider>
  );
};
