import { defineComponent, h } from 'vue';
import type { ComponentRegistry } from '@layout';
import type { Shell } from '@shell';
import { CANVAS_SLOT_NAME } from '@shell';
import { registerNovaVueComponents } from './components';
import { useCanvasRenderTree, useShellRenderTree } from './composables/shell';
import { useShell } from './composables/context';
import type { SlotWrapper } from './context';
import { NovaShellProvider } from './provider';
import { RenderTree } from './render-tree';

// ═══════════════════════════════════════════════════════════
// <NovaShell> / <NovaCanvas> — the mountable shell surfaces. Each hides the
// provider + render-tree wiring behind one component. The lower-level pieces
// (NovaShellProvider, RenderTree, the composables) stay exported for custom
// composition.
// ═══════════════════════════════════════════════════════════

// Idempotent: the slot components are required by the shell's default
// layouts, and the primitives are the vocabulary every demo expects.
const ensureVueBuiltins = (registry: ComponentRegistry): void => {
  if (registry.has(CANVAS_SLOT_NAME)) return;
  registerNovaVueComponents(registry);
};

// ─── <NovaShell> ───────────────────────────────────────────

export type NovaShellProps = {
  shell: Shell;
  // render against a different registry than shell.registry (rare)
  registry?: ComponentRegistry;
  // wraps every action instance's content at the ActionSlot seam
  slotWrapper?: SlotWrapper;
  // register the Vue builtins on the resolved registry. Default true.
  builtins?: boolean;
};

const ShellRenderTreeView = defineComponent(
  () => {
    const nodes = useShellRenderTree();
    return () => h(RenderTree, { nodes: nodes.value });
  },
  { name: 'NovaShellRenderTree' },
);

export const NovaShell = defineComponent(
  (props: NovaShellProps) => {
    if (props.builtins !== false) ensureVueBuiltins(props.registry ?? props.shell.registry);
    return () =>
      h(
        NovaShellProvider,
        { shell: props.shell, registry: props.registry, slotWrapper: props.slotWrapper },
        { default: () => h(ShellRenderTreeView) },
      );
  },
  { name: 'NovaShell', props: ['shell', 'registry', 'slotWrapper', 'builtins'] },
);

// ─── <NovaCanvas> ──────────────────────────────────────────

export type NovaCanvasProps = {
  // the canvas to render
  id: string;
  // when given, NovaCanvas provides its own shell; when omitted it must sit
  // inside a <NovaShell> / <NovaShellProvider>
  shell?: Shell;
  registry?: ComponentRegistry;
  builtins?: boolean;
};

const CanvasRenderTreeView = defineComponent(
  (props: { canvasId: string }) => {
    // asserts a shell is provided — useShell throws a clear error otherwise
    useShell();
    const nodes = useCanvasRenderTree(() => props.canvasId);
    return () => h(RenderTree, { nodes: nodes.value });
  },
  { name: 'NovaCanvasRenderTree', props: ['canvasId'] },
);

export const NovaCanvas = defineComponent(
  (props: NovaCanvasProps) => {
    const { shell } = props;
    if (shell !== undefined && props.builtins !== false) ensureVueBuiltins(props.registry ?? shell.registry);
    return () => {
      const view = h(CanvasRenderTreeView, { canvasId: props.id });
      if (props.shell === undefined) return view;
      return h(NovaShellProvider, { shell: props.shell, registry: props.registry }, { default: () => view });
    };
  },
  { name: 'NovaCanvas', props: ['id', 'shell', 'registry', 'builtins'] },
);
