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

const ensureVueBuiltins = (registry: ComponentRegistry): void => {
  if (registry.has(CANVAS_SLOT_NAME)) return;
  registerNovaVueComponents(registry);
};

export type NovaShellProps = {
  shell: Shell;
  registry?: ComponentRegistry;
  slotWrapper?: SlotWrapper;
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

export type NovaCanvasProps = {
  id: string;
  shell?: Shell;
  registry?: ComponentRegistry;
  builtins?: boolean;
};

const CanvasRenderTreeView = defineComponent(
  (props: { canvasId: string }) => {
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
