import { isObject } from '@shared/common';
import { LifecycleError, type LifecycleHook } from '@shared/errors';
import type { ActionDefinition } from '../schemas';
import type { TransformFn } from '../types';
import { executeSteps, type StepContext } from './steps';

export const buildInitialData = (
  definition: ActionDefinition,
  input: Record<string, unknown> | undefined,
  transform: TransformFn | undefined,
): Record<string, unknown> => {
  const defaults = definition.data ?? {};
  const merged: Record<string, unknown> = { ...defaults, ...(input ?? {}) };
  if (transform === undefined) return merged;
  const transformed = transform({ pass: true }, merged);
  if (isObject(transformed)) return transformed;
  return merged;
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
