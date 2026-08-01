import type { Canvas } from './canvas';
import type { RuntimeRegistry } from './runtime-registry';
import type { Telemetry } from './telemetry';

// ═══════════════════════════════════════════════════════════
// Shell lifecycle ops — small helpers that the shell public API
// composes with its own guards. Factored out to keep `shell.ts`
// focused on assembly and navigation wiring.
// ═══════════════════════════════════════════════════════════

export type LifecycleOpsDeps = {
  registry: RuntimeRegistry;
  telemetry: Telemetry;
  onLifecycleError: (err: unknown) => void;
  // Called as an instance is torn down, so per-instance bookkeeping the shell
  // holds beside the registry (push origins) never outlives what it describes.
  onUnmount?: (instanceId: string) => void;
};

export type LifecycleOps = {
  unmountInstance: (instanceId: string) => void;
  suspendTop: (canvas: Canvas) => void;
  resumeTop: (canvas: Canvas) => void;
};

export const createLifecycleOps = (deps: LifecycleOpsDeps): LifecycleOps => {
  const { registry, onLifecycleError, onUnmount } = deps;

  // Track instances we've already unmounted so a redundant unmount is a
  // no-op (idempotency) — never re-fires hooks, never re-disposes.
  const unmounted = new Set<string>();

  const unmountInstance = (instanceId: string): void => {
    if (unmounted.has(instanceId)) return;
    const runtime = registry.get(instanceId);
    if (runtime === undefined) return;
    unmounted.add(instanceId);
    runtime.unmount().catch(onLifecycleError);
    runtime.dispose();
    registry.unregister(instanceId);
    onUnmount?.(instanceId);
  };

  const suspendTop = (canvas: Canvas): void => {
    const top = canvas.peek();
    if (top === undefined) return;
    const runtime = registry.get(top.id);
    if (runtime !== undefined) runtime.suspend().catch(onLifecycleError);
  };

  const resumeTop = (canvas: Canvas): void => {
    const top = canvas.peek();
    if (top === undefined) return;
    const runtime = registry.get(top.id);
    if (runtime !== undefined) runtime.resume().catch(onLifecycleError);
  };

  return { unmountInstance, suspendTop, resumeTop };
};
