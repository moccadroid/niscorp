import { LifecycleError, type LifecycleHook } from '@shared/errors';
import type { ActionDefinition } from '../schemas';
import { executeSteps, type StepContext } from './steps';

export const buildInitialData = (
  definition: ActionDefinition,
  input: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const defaults = definition.data ?? {};
  // Deep-clone so the runtime owns an isolated data tree: neither
  // `definition.data` nor the caller's `input` can be mutated by later in-place
  // mutations. Initial data is NOT transformed — the injected `transform` is
  // endpoint-only (request/response), never applied to the data on mount.
  return structuredClone({ ...defaults, ...(input ?? {}) });
};

export const runLifecycleHook = async (
  hook: LifecycleHook,
  definition: ActionDefinition,
  buildContext: () => StepContext,
): Promise<void> => {
  const lifecycle = definition.lifecycle;
  if (lifecycle === undefined) return;
  const steps = lifecycle[hook];
  if (steps === undefined || steps.length === 0) return;
  const ctx: StepContext = { ...buildContext(), lifecycleHook: hook };
  try {
    await executeSteps(steps, ctx);
  } catch (err) {
    if (!ctx.strict) {
      ctx.onError(
        err instanceof LifecycleError
          ? err
          : new LifecycleError(
              err instanceof Error ? err.message : String(err),
              { hook },
              { cause: err },
            ),
      );
      return;
    }
    if (err instanceof LifecycleError) throw err;
    throw new LifecycleError(
      err instanceof Error ? err.message : String(err),
      { hook },
      { cause: err },
    );
  }
};
