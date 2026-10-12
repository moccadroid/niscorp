import { useMemo, useState, type FC, type ReactNode } from 'react';
import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type ComponentRegistry,
  type LayoutNode,
  type LayoutStore,
  type RegistrationInput,
  type RenderContext,
  type RenderOnError,
} from '@layout';
import type { Shell } from '@shell';
import { registerNovaReactComponents } from './components';
import type { SlotWrapper } from './context';
import { NovaRenderProvider, NovaShellProvider } from './provider';
import { RenderTree } from './render-tree';
import { useCanvasRenderTree } from './hooks/use-canvas-render-tree';
import { useShell } from './hooks/use-shell';
import { useShellRenderTree } from './hooks/use-shell-render-tree';
import type { NovaComponent } from './types';

const ensureReactBuiltins = (registry: ComponentRegistry<NovaComponent>): void => {
  if (registry.has('CanvasSlot')) return;
  registerNovaReactComponents(registry);
};

export type NovaLayoutProps = {
  layout: LayoutNode | string;
  data?: Record<string, unknown>;
  components?: Record<string, RegistrationInput<NovaComponent>>;
  registry?: ComponentRegistry<NovaComponent>;
  store?: LayoutStore;
  builtins?: boolean;
  strict?: boolean;
  onError?: RenderOnError;
  phrases?: RenderContext['phrases'];
  phraseKeys?: RenderContext['phraseKeys'];
  onPhraseMiss?: RenderContext['onPhraseMiss'];
  children?: ReactNode;
};

export const NovaLayout: FC<NovaLayoutProps> = ({
  layout,
  data,
  components,
  registry: registryProp,
  store: storeProp,
  builtins = true,
  strict,
  onError,
  phrases,
  phraseKeys,
  onPhraseMiss,
  children,
}) => {
  // useState, not useMemo: the registry and the store are created once and stay
  // for the life of this component.
  const [registry] = useState<ComponentRegistry<NovaComponent>>(() => {
    if (registryProp !== undefined) return registryProp;
    const reg = createComponentRegistry<NovaComponent>();
    if (builtins) registerNovaReactComponents(reg);
    if (components !== undefined) reg.registerAll(components);
    return reg;
  });
  const [store] = useState<LayoutStore>(() => storeProp ?? createLayoutStore());

  const nodes = useMemo(() => {
    const resolved = typeof layout === 'string' ? store.get(layout) : layout;
    if (resolved === undefined) return [];
    return renderLayout(resolved, data ?? {}, {
      store,
      registry,
      ...(strict === undefined ? {} : { strict }),
      ...(onError === undefined ? {} : { onError }),
      ...(phrases === undefined ? {} : { phrases }),
      ...(phraseKeys === undefined ? {} : { phraseKeys }),
      ...(onPhraseMiss === undefined ? {} : { onPhraseMiss }),
    });
  }, [layout, data, store, registry, strict, onError, phrases, phraseKeys, onPhraseMiss]);

  return (
    <NovaRenderProvider registry={registry}>
      <RenderTree nodes={nodes} />
      {children}
    </NovaRenderProvider>
  );
};

export type NovaShellProps = {
  shell: Shell;
  registry?: ComponentRegistry<NovaComponent>;
  slotWrapper?: SlotWrapper;
  builtins?: boolean;
};

const ShellRenderTreeView: FC = () => {
  const nodes = useShellRenderTree();
  return <RenderTree nodes={nodes} />;
};

export const NovaShell: FC<NovaShellProps> = ({ shell, registry, slotWrapper, builtins = true }) => {
  const resolvedRegistry = (registry ?? shell.registry) as ComponentRegistry<NovaComponent>;
  // A lazy useState initializer, not an effect: it runs synchronously, once per
  // mount, before anything below renders.
  useState(() => {
    if (builtins) ensureReactBuiltins(resolvedRegistry);
    return true;
  });
  return (
    <NovaShellProvider shell={shell} registry={resolvedRegistry} slotWrapper={slotWrapper}>
      <ShellRenderTreeView />
    </NovaShellProvider>
  );
};

export type NovaCanvasProps = {
  id: string;
  shell?: Shell;
  registry?: ComponentRegistry<NovaComponent>;
  builtins?: boolean;
};

const CanvasRenderTreeView: FC<{ canvasId: string }> = ({ canvasId }) => {
  const nodes = useCanvasRenderTree(canvasId);
  return <RenderTree nodes={nodes} />;
};

const CanvasInContext: FC<{ canvasId: string }> = ({ canvasId }) => {
  useShell();
  return <CanvasRenderTreeView canvasId={canvasId} />;
};

const CanvasStandalone: FC<{
  canvasId: string;
  shell: Shell;
  registry?: ComponentRegistry<NovaComponent>;
  builtins: boolean;
}> = ({ canvasId, shell, registry, builtins }) => {
  const resolvedRegistry = (registry ?? shell.registry) as ComponentRegistry<NovaComponent>;
  useState(() => {
    if (builtins) ensureReactBuiltins(resolvedRegistry);
    return true;
  });
  return (
    <NovaShellProvider shell={shell} registry={resolvedRegistry}>
      <CanvasRenderTreeView canvasId={canvasId} />
    </NovaShellProvider>
  );
};

export const NovaCanvas: FC<NovaCanvasProps> = ({ id, shell, registry, builtins = true }) => {
  if (shell === undefined) return <CanvasInContext canvasId={id} />;
  return (
    <CanvasStandalone
      canvasId={id}
      shell={shell}
      builtins={builtins}
      {...(registry === undefined ? {} : { registry })}
    />
  );
};

export const Nova = {
  Layout: NovaLayout,
  Shell: NovaShell,
  Canvas: NovaCanvas,
} as const;
