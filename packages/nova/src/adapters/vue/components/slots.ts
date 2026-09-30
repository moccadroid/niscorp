import { defineComponent, h, inject, provide } from 'vue';
import { scopeDispatch } from '@shared/event-bus';
import { ActionSlotPropsSchema, CanvasSlotPropsSchema, type ActionSlotProps, type CanvasSlotProps } from '../../primitive-props';
import { NovaRenderKey, type NovaRenderContextValue } from '../context';
import { useShellSource } from '../composables/context';
import { useCanvasRenderTree, useRenderTree } from '../composables/shell';
import { RenderTree } from '../render-tree';

// ═══════════════════════════════════════════════════════════
// The shell-backed structural slots (ADAPTER.md §4). They pull from the shell
// injection, so they render only inside <NovaShellProvider>. A remote host (a
// moss terminal) registers its own wire-backed pair under the same names.
// ═══════════════════════════════════════════════════════════

export { CanvasSlotPropsSchema, type CanvasSlotProps, ActionSlotPropsSchema, type ActionSlotProps };

// ─── CanvasSlot ────────────────────────────────────────────

export const CanvasSlot = Object.assign(
  defineComponent(
    (props: CanvasSlotProps) => {
      const tree = useCanvasRenderTree(() => props.canvasId);
      return () => (props.canvasId === undefined || props.canvasId === '' ? null : h(RenderTree, { nodes: tree.value }));
    },
    { name: 'NovaCanvasSlot', props: ['canvasId'], inheritAttrs: false },
  ),
  {
    meta: {
      description: 'Renders a canvas by id, recursing into its actionLayout.',
      propsSchema: CanvasSlotPropsSchema,
    },
  },
);

// ─── ActionSlot ────────────────────────────────────────────

// Re-provides the render context with dispatch scoped to one instance, so the
// runtime delivers UI events from its subtree to that instance's own triggers
// only. The stamping rule is core's scopeDispatch — not reimplemented here. It
// sits INSIDE the slot wrapper, as in the React adapter: the wrapper itself is
// outside the instance.
const InstanceScope = defineComponent(
  (props: { instanceId: string }, { slots }) => {
    const parent = inject(NovaRenderKey, undefined);
    if (parent !== undefined) {
      const scoped: NovaRenderContextValue = {
        get registry() {
          return parent.registry;
        },
        get dispatch() {
          return scopeDispatch(parent.dispatch, props.instanceId);
        },
        get publish() {
          return parent.publish;
        },
        get slotWrapper() {
          return parent.slotWrapper;
        },
        get fallback() {
          return parent.fallback;
        },
      };
      provide(NovaRenderKey, scoped);
    }
    return () => slots.default?.();
  },
  { name: 'NovaInstanceScope', props: ['instanceId'] },
);

export const ActionSlot = Object.assign(
  defineComponent(
    (props: ActionSlotProps) => {
      const source = useShellSource();
      const ctx = inject(NovaRenderKey, undefined);
      const tree = useRenderTree(() => props.instanceId ?? '');
      return () => {
        const instanceId = props.instanceId;
        const hasInstance = instanceId !== undefined && instanceId !== '';
        const content =
          hasInstance && tree.value.length > 0
            ? h(InstanceScope, { instanceId }, { default: () => h(RenderTree, { nodes: tree.value }) })
            : null;
        const Wrapper = ctx?.slotWrapper;
        if (Wrapper === undefined) return content;
        // With a wrapper, render it PERSISTENTLY (content or null) so a
        // presence-managing wrapper can animate an instance leaving. Identity
        // resolves from the live runtime; undefined while empty or exiting.
        const runtime = hasInstance ? source.shell.getRuntime(instanceId) : undefined;
        return h(
          Wrapper,
          { canvasId: runtime?.instance.canvasId, instanceId: hasInstance ? instanceId : undefined, action: runtime?.definition },
          { default: () => content },
        );
      };
    },
    { name: 'NovaActionSlot', props: ['instanceId'], inheritAttrs: false },
  ),
  {
    meta: {
      description: 'Renders an action instance by id. Used inside a canvas actionLayout.',
      propsSchema: ActionSlotPropsSchema,
    },
  },
);
