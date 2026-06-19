import { useMemo, useState, type FC, type ReactNode } from 'react';
import {
  createComponentRegistry,
  createLayoutStore,
  renderLayout,
  type ComponentRegistry,
  type LayoutNode,
  type LayoutStore,
  type RegistrationInput,
  type RenderOnError,
} from '@layout';
import type { Shell } from '@shell';
import { registerNovaReactComponents } from '../components/react';
import type { SlotWrapper } from './context';
import { NovaRenderProvider, NovaShellProvider } from './provider';
import { RenderTree } from './render-tree';
import { useCanvasRenderTree } from './hooks/use-canvas-render-tree';
import { useShell } from './hooks/use-shell';
import { useShellRenderTree } from './hooks/use-shell-render-tree';
import type { NovaComponent } from './types';

// ═══════════════════════════════════════════════════════════
// <Nova.Layout> / <Nova.Shell> / <Nova.Canvas>
//
// The three mountable surfaces for Nova. Each hides the
// registry/store/provider/render-tree wiring behind a single
// component so stories and apps can stay declarative.
//
//   <Nova.Layout layout data components? />
//   <Nova.Shell  shell />
//   <Nova.Canvas shell? id />
//
// Lower-level primitives (NovaShellProvider, RenderTree, the
// render-tree hooks) remain exported for advanced composition.
// ═══════════════════════════════════════════════════════════

const ensureReactBuiltins = (registry: ComponentRegistry<NovaComponent>): void => {
  // Idempotent: the React adapter's slot components (CanvasSlot / ActionSlot)
  // are required for the shell's default layouts, and the primitive
  // components (Stack, Text, Input, Button, Box) are the authoring vocabulary
  // every demo expects. A single presence check short-circuits re-registration.
  if (registry.has('CanvasSlot')) return;
  registerNovaReactComponents(registry);
};

// ─── <Nova.Layout> ─────────────────────────────────────────

export type NovaLayoutProps = {
  // The layout tree to render. Inline LayoutNode or a LayoutStore id
  // (requires `store` to contain that id).
  layout: LayoutNode | string;
  // Data scope for resolvables (`$.x`, `{{x}}`). Defaults to `{}`.
  data?: Record<string, unknown>;
  // Extra components to register. Merged after builtins so they can
  // override (rare) or extend (common) the default set.
  components?: Record<string, RegistrationInput<NovaComponent>>;
  // Pass a pre-built registry instead of letting Nova create one.
  // When provided, `components` and `builtins` are ignored — the
  // caller is responsible for the registry's contents.
  registry?: ComponentRegistry<NovaComponent>;
  // Pass a pre-built layout store instead of letting Nova create one.
  store?: LayoutStore;
  // Register Nova's React builtins (Stack, Text, Input, Button, Box,
  // CanvasSlot, ActionSlot). Default true. Only applies when `registry`
  // was NOT provided.
  builtins?: boolean;
  strict?: boolean;
  onError?: RenderOnError;
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
  children,
}) => {
  // A registry and store are stable for the lifetime of this component
  // instance. useState(init) fixes them on first render without the hazards
  // of registering during useMemo recomputation.
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
    });
  }, [layout, data, store, registry, strict, onError]);

  return (
    <NovaRenderProvider registry={registry}>
      <RenderTree nodes={nodes} />
      {children}
    </NovaRenderProvider>
  );
};

// ─── <Nova.Shell> ──────────────────────────────────────────

export type NovaShellProps = {
  shell: Shell;
  // Override the registry used for rendering. Defaults to shell.registry.
  // Pass this only when the same shell should render against a different
  // component set (rare — typically for theming or A/B swaps).
  registry?: ComponentRegistry<NovaComponent>;
  // Optional app-supplied component that wraps every action instance's content
  // at the ActionSlot seam (animation, auth/feature gates, logging, …). Nova
  // owns none of that logic — see `SlotWrapper`. Omit for plain rendering.
  slotWrapper?: SlotWrapper;
  // Ensure the React adapter's slot components are registered on the
  // shell's registry. Default true. Safe to leave on — idempotent.
  builtins?: boolean;
};

const ShellRenderTreeView: FC = () => {
  const nodes = useShellRenderTree();
  return <RenderTree nodes={nodes} />;
};

export const NovaShell: FC<NovaShellProps> = ({ shell, registry, slotWrapper, builtins = true }) => {
  const resolvedRegistry = (registry ?? shell.registry) as ComponentRegistry<NovaComponent>;
  // Register React builtins onto the resolved registry on first render.
  // useState's lazy initializer gives us a synchronous, once-per-mount hook.
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

// ─── <Nova.Canvas> ─────────────────────────────────────────

export type NovaCanvasProps = {
  // The canvas to render.
  id: string;
  // Optional: when provided, Nova.Canvas creates its own NovaShellProvider.
  // When omitted, Nova.Canvas must be nested inside an existing
  // <Nova.Shell> / <NovaShellProvider>.
  shell?: Shell;
  registry?: ComponentRegistry<NovaComponent>;
  builtins?: boolean;
};

const CanvasRenderTreeView: FC<{ canvasId: string }> = ({ canvasId }) => {
  const nodes = useCanvasRenderTree(canvasId);
  return <RenderTree nodes={nodes} />;
};

const CanvasInContext: FC<{ canvasId: string }> = ({ canvasId }) => {
  // Asserts we're inside a NovaShellProvider so useShell doesn't throw.
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

// ─── namespace ─────────────────────────────────────────────

export const Nova = {
  Layout: NovaLayout,
  Shell: NovaShell,
  Canvas: NovaCanvas,
} as const;
