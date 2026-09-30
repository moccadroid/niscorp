import { defineComponent, h, onErrorCaptured, shallowRef, type VNodeChild } from 'vue';

// ═══════════════════════════════════════════════════════════
// Vue's error boundary is a hook, not a class: onErrorCaptured stops the
// error propagating (return false) and swaps the subtree for a fallback.
// ═══════════════════════════════════════════════════════════

export type NovaErrorBoundaryProps = {
  fallback?: (error: Error) => VNodeChild;
  onError?: (error: Error, info: string) => void;
};

export const NovaErrorBoundary = defineComponent(
  (props: NovaErrorBoundaryProps, { slots }) => {
    const caught = shallowRef<Error | undefined>(undefined);
    onErrorCaptured((err, _instance, info) => {
      const error = err instanceof Error ? err : new Error(String(err));
      caught.value = error;
      props.onError?.(error, info);
      return false;
    });
    return () => {
      const error = caught.value;
      if (error === undefined) return slots.default?.();
      if (props.fallback !== undefined) return props.fallback(error);
      return h('div', { 'data-nova-error-boundary': 'true', role: 'alert' }, error.message);
    };
  },
  { name: 'NovaErrorBoundary', props: ['fallback', 'onError'] },
);
