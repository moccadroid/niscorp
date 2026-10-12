import { LifecycleError, type LifecycleHook } from '@shared/errors';
import type { ActionDefinition } from '../schemas';
import { executeSteps, type StepContext } from './steps';

export const buildInitialData = (
  definition: ActionDefinition,
  input: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const defaults = definition.data ?? {};
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
