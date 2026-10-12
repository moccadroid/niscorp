import type { Canvas } from './canvas';
import type { RuntimeRegistry } from './runtime-registry';
import type { Telemetry } from './telemetry';

export type LifecycleOpsDeps = {
  registry: RuntimeRegistry;
  telemetry: Telemetry;
  onLifecycleError: (err: unknown) => void;
  onUnmount?: (instanceId: string) => void;
  onChain?: (chain: Promise<unknown>) => void;
};

export type LifecycleOps = {
  unmountInstance: (instanceId: string) => void;
  suspendTop: (canvas: Canvas) => void;
  resumeTop: (canvas: Canvas) => void;
};

export const createLifecycleOps = (deps: LifecycleOpsDeps): LifecycleOps => {
  const { registry, onLifecycleError, onUnmount, onChain } = deps;

  // Two statements: an optional call does not evaluate its argument when
  // there is nobody to call, and the failure would go unrouted.
  const detached = (hook: Promise<void>): void => {
    const chain = hook.catch(onLifecycleError);
    onChain?.(chain);
  };

  const unmounted = new Set<string>();

  const unmountInstance = (instanceId: string): void => {
    if (unmounted.has(instanceId)) return;
    const runtime = registry.get(instanceId);
    if (runtime === undefined) return;
    unmounted.add(instanceId);
    detached(runtime.unmount());
    runtime.dispose();
    registry.unregister(instanceId);
    onUnmount?.(instanceId);
    // The set only has to cover re-entry inside this call: once the registry
    // no longer holds the instance, the `registry.get` guard returns early.
    unmounted.delete(instanceId);
  };

  const suspendTop = (canvas: Canvas): void => {
    const top = canvas.peek();
    if (top === undefined) return;
    // `back` restoring a position above the one on screen finds a top that is
    // already suspended: its suspend hook must not fire again.
    if (top.status === 'suspended') return;
    const runtime = registry.get(top.id);
    if (runtime !== undefined) detached(runtime.suspend());
  };

  const resumeTop = (canvas: Canvas): void => {
    const top = canvas.peek();
    if (top === undefined) return;
    const runtime = registry.get(top.id);
    if (runtime !== undefined) detached(runtime.resume());
  };

  return { unmountInstance, suspendTop, resumeTop };
};
